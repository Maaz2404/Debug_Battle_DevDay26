import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { enqueueCompileJob } from '../queues/compileQueue.js';
import { getCompetitionState } from './competitionStateService.js';
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
      question_id: payload.questionId,
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

  const state = await getCompetitionState(env.COMPETITION_ID);
  console.log('[submit-service] competition state', {
    competition_id: env.COMPETITION_ID,
    round_status: state.round.status,
    active_round_id: state.round.round_id,
  });

  if (state.round.status !== 'ACTIVE') {
    throw new HttpError(409, 'Round is not active');
  }

  if (state.round.round_id && normalized.roundId !== state.round.round_id) {
    throw new HttpError(400, 'roundId does not match active round');
  }

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

    submissionId = await createPendingSubmitSubmission({
      auth,
      payload: normalized,
    });

    console.log('[submit-service] enqueueing compile job', {
      submissionId,
      teamId: auth.team_id,
      userId: auth.user_id,
      questionId: normalized.questionId,
      roundId: normalized.roundId,
      language: normalized.language,
      questionBaseScore: question.base_score ?? 100,
      test_case_count: Array.isArray(question.test_cases) ? question.test_cases.length : 0,
    });

    await enqueueCompileJob({
      submissionId,
      teamId: auth.team_id,
      userId: auth.user_id,
      questionId: normalized.questionId,
      roundId: normalized.roundId,
      code: normalized.code,
      language: normalized.language,
      testCases: question.test_cases || [],
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
