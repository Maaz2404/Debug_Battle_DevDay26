import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { enqueueCompileJob } from '../queues/compileQueue.js';
import { assertCanAttemptQuestion } from './competitionEngine.js';
import { HttpError } from '../utils/http.js';

function validateRunPayload(payload) {
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

  return {
    code,
    language,
    questionId,
    roundId,
  };
}

async function getQuestionForRun(questionId, roundId) {
  console.log('[run-service] loading question', { questionId, roundId });
  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('id, round_id, position, test_cases')
    .eq('id', questionId)
    .eq('round_id', roundId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, 'Failed to read question', error.message);
  }

  if (!data) {
    throw new HttpError(404, 'Question not found for round');
  }

  console.log('[run-service] question loaded', {
    question_id: data.id,
    round_id: data.round_id,
    position: data.position,
    test_case_count: Array.isArray(data.test_cases) ? data.test_cases.length : 0,
  });

  return data;
}

async function createPendingRunSubmission({ auth, payload }) {
  console.log('[run-service] creating pending submission', {
    user_id: auth.user_id,
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
      job_type: 'run',
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

  console.log('[run-service] pending submission created', { submission_id: data.id });

  return data.id;
}

export async function submitRunJob(payload, auth) {
  if (!auth?.team_id) {
    throw new HttpError(409, 'Authenticated user is not linked to a team');
  }

  const normalized = validateRunPayload(payload);
  console.log('[run-service] payload validated', {
    questionId: normalized.questionId,
    roundId: normalized.roundId,
    language: normalized.language,
    code_length: normalized.code.length,
  });

  const runtimeState = await assertCanAttemptQuestion(normalized.roundId, normalized.questionId);
  console.log('[run-service] competition runtime state', {
    competition_id: env.COMPETITION_ID,
    round_status: runtimeState.status,
    phase: runtimeState.phase,
    active_round_id: runtimeState.roundId,
    current_question_index: runtimeState.currentQuestionIndex,
  });

  const question = await getQuestionForRun(normalized.questionId, normalized.roundId);

  const submissionId = await createPendingRunSubmission({
    auth,
    payload: normalized,
  });

  console.log('[run-service] enqueueing compile job', {
    submissionId,
    teamId: auth.team_id,
    userId: auth.user_id,
    questionId: normalized.questionId,
    roundId: normalized.roundId,
    language: normalized.language,
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
    jobType: 'run',
  });

  console.log('[run-service] compile job enqueued', { submissionId });

  return {
    submission_id: submissionId,
    status: 'PENDING',
  };
}
