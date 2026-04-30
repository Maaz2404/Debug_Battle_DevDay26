import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { enqueueCompileJob } from '../queues/compileQueue.js';
import { assertCanAttemptQuestion } from './competitionEngine.js';
import { HttpError } from '../utils/http.js';

function validateSubmitPayload(payload) {
  const { code, language, questionId, roundId } = payload;

  if (!code || typeof code !== 'string') {
    throw new HttpError(400, 'code is required');
  }

  if (!language || typeof language !== 'string') {
    throw new HttpError(400, 'language is required');
  }

  if (!questionId || typeof questionId !== 'string') {
    throw new HttpError(400, 'questionId is required');
  }

  if (!roundId || typeof roundId !== 'string') {
    throw new HttpError(400, 'roundId is required');
  }

  return { code, language, questionId, roundId };
}

async function getQuestionForSubmit(questionId, roundId) {
  console.log('[submit-service] loading question', { questionId, roundId });
  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('id, round_id, position, test_cases, base_score')
    .eq('id', questionId)
    .eq('round_id', roundId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, 'Failed to read question', error.message);
  }

  if (!data) {
    throw new HttpError(404, 'Question not found for round');
  }

  console.log('[submit-service] question loaded', {
    question_id: data.id,
    round_id: data.round_id,
    position: data.position,
    base_score: data.base_score,
    test_case_count: Array.isArray(data.test_cases) ? data.test_cases.length : 0,
  });

  // If the question row has no test cases, attempt to find a sibling question
  // (same round & position) that contains test_cases (useful when questions
  // are stored per-language).
  if (!Array.isArray(data.test_cases) || data.test_cases.length === 0) {
    try {
      const { data: alt, error: altError } = await supabaseAdmin
        .from('questions')
        .select('id, round_id, position, test_cases, language, base_score')
        .eq('round_id', roundId)
        .eq('position', data.position)
        .neq('test_cases', '[]')
        .limit(1)
        .maybeSingle();

      if (alt && Array.isArray(alt.test_cases) && alt.test_cases.length > 0) {
        console.log('[submit-service] using fallback question with test_cases', {
          original_question_id: data.id,
          fallback_question_id: alt.id,
          fallback_language: alt.language,
          test_case_count: alt.test_cases.length,
        });
        return alt;
      }
      if (altError) {
        console.warn('[submit-service] fallback query error', { message: altError.message });
      }
    } catch (e) {
      console.warn('[submit-service] fallback query failed', { message: e?.message || String(e) });
    }
  }

  return data;
}

async function createPendingSubmitSubmission({ auth, payload }) {
  console.log('[submit-service] creating pending submission', {
    team_id: auth.team_id,
    question_id: payload.questionId,
    round_id: payload.roundId,
    language: payload.language,
  });

  const { data, error } = await supabaseAdmin
    .from('submissions')
    .insert({
      team_id: auth.team_id,
      question_id: payload.canonicalQuestionId || payload.questionId,
      round_id: payload.roundId,
      job_type: 'submit',
      code: payload.code,
      language: payload.language,
      status: 'PENDING',
      result: null,
    })
    .select('id')
    .single();

  if (error) {
    throw new HttpError(500, 'Failed to create submission', error.message);
  }

  console.log('[submit-service] pending submission created', { submission_id: data.id });
  return data.id;
}

export async function submitCodeJob(payload, auth) {
  if (!auth?.team_id) {
    throw new HttpError(409, 'Authenticated user is not linked to a team');
  }

  const normalized = validateSubmitPayload(payload);
  console.log('[submit-service] payload validated', {
    questionId: normalized.questionId,
    roundId: normalized.roundId,
    language: normalized.language,
    code_length: normalized.code.length,
  });

  const runtimeState = await assertCanAttemptQuestion(normalized.roundId, normalized.questionId);
  console.log('[submit-service] competition runtime state', {
    competition_id: env.COMPETITION_ID,
    round_status: runtimeState.status,
    phase: runtimeState.phase,
    active_round_id: runtimeState.roundId,
    current_question_index: runtimeState.currentQuestionIndex,
  });

  const runpassKey = `runpass:${auth.team_id}:${normalized.questionId}:${normalized.roundId}`;
  const runPass = await redis.get(runpassKey);
  if (!runPass) {
    throw new HttpError(403, 'Submit requires a passing run first');
  }

  const dedupKey = `dedup:${auth.team_id}:${normalized.questionId}`;
  const lock = await redis.set(dedupKey, '1', 'NX', 'EX', 60);
  if (lock !== 'OK') {
    throw new HttpError(429, 'Duplicate submission');
  }

  let submissionId = null;
  try {
    const question = await getQuestionForSubmit(normalized.questionId, normalized.roundId);

    // Determine canonical question id for this round+position to include
    // with the compile job so runpass keys are set for the canonical id as well.
    let canonicalQuestionId = normalized.questionId;
    try {
      const { data: rows, error: rowsError } = await supabaseAdmin
        .from('questions')
        .select('id, language, position')
        .eq('round_id', normalized.roundId)
        .eq('position', question.position || 0);

      if (!rowsError && Array.isArray(rows) && rows.length > 0) {
        const pick = (rows) => {
          const js = rows.find((r) => String(r.language || '').toLowerCase() === 'javascript');
          if (js) return js.id;
          const py = rows.find((r) => String(r.language || '').toLowerCase() === 'python');
          if (py) return py.id;
          const cpp = rows.find((r) => String(r.language || '').toLowerCase() === 'cpp');
          if (cpp) return cpp.id;
          return rows[0].id;
        };
        canonicalQuestionId = pick(rows);
      }
    } catch (e) {
      console.warn('[submit-service] failed to determine canonical question id', { message: e?.message || String(e) });
    }

    submissionId = await createPendingSubmitSubmission({
      auth,
      payload: { ...normalized, canonicalQuestionId },
    });

    console.log('[submit-service] enqueueing compile job', {
      submissionId,
      teamId: auth.team_id,
      userId: auth.user_id,
      questionId: normalized.questionId,
      canonicalQuestionId,
      roundId: normalized.roundId,
      language: normalized.language,
      questionBaseScore: question.base_score ?? 100,
      test_case_count: Array.isArray(question.test_cases) ? question.test_cases.length : 0,
    });

    await enqueueCompileJob({
      submissionId,
      teamId: auth.team_id,
      userId: auth.user_id,
      // Use canonical question id for job grouping, keep original id on submission
      questionId: canonicalQuestionId,
      originalQuestionId: normalized.questionId,
      roundId: normalized.roundId,
      code: normalized.code,
      language: normalized.language,
      testCases: question.test_cases || [],
      canonicalQuestionId,
      questionBaseScore: Number(question.base_score ?? 100),
      jobType: 'submit',
    });

    console.log('[submit-service] compile job enqueued', { submissionId });

    return {
      submission_id: submissionId,
      status: 'PENDING',
    };
  } catch (error) {
    await redis.del(dedupKey);
    console.error('[submit-service] failed after dedup lock; lock released', {
      submissionId,
      dedupKey,
      message: error.message,
    });
    throw error;
  }
}
