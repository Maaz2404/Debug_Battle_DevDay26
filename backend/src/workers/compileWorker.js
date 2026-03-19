import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { runCodeOnOneCompiler } from '../services/oneCompilerService.js';
import { emitToRoom, emitToUserSockets } from '../socket/registry.js';

function normalizeOutput(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function toSpaceString(value) {
  if (Array.isArray(value)) {
    return value.join(' ');
  }
  return String(value ?? '');
}

function bonusByRank(rank) {
  if (rank === 1) return 50;
  if (rank === 2) return 40;
  if (rank === 3) return 30;
  if (rank === 4) return 20;
  if (rank === 5) return 10;
  return 5;
}

function dedupKey(teamId, questionId) {
  return `dedup:${teamId}:${questionId}`;
}

async function updateSubmission(submissionId, fields) {
  console.log('[compile-worker] updating submission', { submissionId, fields });

  const { error } = await supabaseAdmin
    .from('submissions')
    .update(fields)
    .eq('id', submissionId);

  if (error) {
    throw new Error(`Failed to update submission ${submissionId}: ${error.message}`);
  }
}

async function getRoundRemainingSeconds(roundId) {
  const fallback = 3600;
  const { data, error } = await supabaseAdmin
    .from('rounds')
    .select('status, duration_seconds, started_at')
    .eq('id', roundId)
    .maybeSingle();

  if (error || !data) {
    return fallback;
  }

  if (!data.started_at || data.status !== 'ACTIVE') {
    return Math.max(1, Number(data.duration_seconds) || fallback);
  }

  const elapsed = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000);
  const remaining = Math.max(1, (Number(data.duration_seconds) || fallback) - elapsed);
  return remaining;
}

async function setRunPassKey({ teamId, questionId, roundId }) {
  const ttlSeconds = await getRoundRemainingSeconds(roundId);
  const key = `runpass:${teamId}:${questionId}:${roundId}`;
  console.log('[compile-worker] setting runpass key', { key, ttl_seconds: ttlSeconds });
  await redis.set(key, '1', 'EX', ttlSeconds);
}

async function evaluateTestCases({ submissionId, language, code, testCases }) {
  const testResults = [];

  for (const tc of testCases) {
    const tcInputRaw = tc.input ?? '';
    const tcExpectedRaw = tc.expected_output ?? '';
    const tcInput = toSpaceString(tcInputRaw);
    const tcExpected = toSpaceString(tcExpectedRaw);

    console.log('[compile-worker] running testcase', {
      submissionId,
      input_raw: tcInputRaw,
      input_for_stdin: tcInput,
      expected_raw: tcExpectedRaw,
    });

    const execution = await runCodeOnOneCompiler({
      language,
      code,
      stdin: tcInput,
    });

    const actual = normalizeOutput(execution?.stdout);
    const expected = normalizeOutput(tcExpected);
    const passed = actual === expected;

    testResults.push({
      input: tcInput,
      expected,
      actual,
      passed,
      stderr: normalizeOutput(execution?.stderr),
    });
  }

  const passedCount = testResults.filter((tr) => tr.passed).length;
  const total = testResults.length;
  const allPassed = total > 0 && passedCount === total;

  return {
    passed: passedCount,
    total,
    allPassed,
    test_results: testResults,
  };
}

async function processRunJob(job) {
  const {
    submissionId,
    teamId,
    userId,
    questionId,
    roundId,
    code,
    language,
    testCases,
  } = job.data;

  console.log('[compile-worker] processing run job', {
    jobId: job.id,
    submissionId,
    teamId,
    userId,
    questionId,
    roundId,
    language,
    test_case_count: Array.isArray(testCases) ? testCases.length : 0,
  });

  await updateSubmission(submissionId, { status: 'COMPILING' });

  const evaluation = await evaluateTestCases({
    submissionId,
    language,
    code,
    testCases,
  });

  const status = evaluation.allPassed ? 'ACCEPTED' : 'WRONG_ANSWER';
  const result = {
    passed: evaluation.passed,
    total: evaluation.total,
    test_results: evaluation.test_results,
  };

  console.log('[compile-worker] testcase evaluation complete', {
    submissionId,
    status,
    passed: evaluation.passed,
    total: evaluation.total,
  });

  await updateSubmission(submissionId, { status, result });

  if (evaluation.allPassed) {
    await setRunPassKey({ teamId, questionId, roundId });
  }

  emitToUserSockets(userId, 'run:result', {
    submission_id: submissionId,
    question_id: questionId,
    round_id: roundId,
    status,
    result,
  });

  console.log('[compile-worker] emitted run:result', { submissionId, userId, status });
}

async function countWrongSubmitAttempts(teamId, questionId) {
  const { count, error } = await supabaseAdmin
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('question_id', questionId)
    .eq('job_type', 'submit')
    .eq('status', 'WRONG_ANSWER');

  if (error) {
    throw new Error(`Failed to count wrong submit attempts: ${error.message}`);
  }

  return Number(count || 0);
}

async function countAcceptedSubmitForRank(questionId) {
  // TODO: Replace with SELECT FOR UPDATE transaction to serialize rank assignment exactly as PRD specifies.
  const { count, error } = await supabaseAdmin
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)
    .eq('job_type', 'submit')
    .eq('status', 'ACCEPTED');

  if (error) {
    throw new Error(`Failed to count accepted submits: ${error.message}`);
  }

  return Number(count || 0);
}

async function getTeamTotalScore(teamId) {
  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select('total_score')
    .eq('team_id', teamId)
    .eq('job_type', 'submit')
    .eq('status', 'ACCEPTED');

  if (error) {
    throw new Error(`Failed to read team total score: ${error.message}`);
  }

  return (data || []).reduce((sum, row) => sum + Number(row.total_score || 0), 0);
}

async function processSubmitJob(job) {
  const {
    submissionId,
    teamId,
    userId,
    questionId,
    roundId,
    code,
    language,
    testCases,
    questionBaseScore,
  } = job.data;

  console.log('[compile-worker] processing submit job', {
    jobId: job.id,
    submissionId,
    teamId,
    userId,
    questionId,
    roundId,
    language,
    questionBaseScore,
    test_case_count: Array.isArray(testCases) ? testCases.length : 0,
  });

  await updateSubmission(submissionId, { status: 'COMPILING' });

  const evaluation = await evaluateTestCases({
    submissionId,
    language,
    code,
    testCases,
  });

  if (!evaluation.allPassed) {
    const result = {
      passed: evaluation.passed,
      total: evaluation.total,
      test_results: evaluation.test_results,
    };

    await updateSubmission(submissionId, {
      status: 'WRONG_ANSWER',
      result,
    });

    await redis.del(dedupKey(teamId, questionId));

    emitToUserSockets(userId, 'submission:result', {
      submission_id: submissionId,
      question_id: questionId,
      round_id: roundId,
      status: 'WRONG_ANSWER',
      result,
    });

    return;
  }

  const wrongAttempts = await countWrongSubmitAttempts(teamId, questionId);
  const effectiveBaseScore = Math.max(10, Number(questionBaseScore || 100) - (wrongAttempts * 5));
  const acceptedCount = await countAcceptedSubmitForRank(questionId);
  const solveRank = acceptedCount + 1;
  const bonusScore = bonusByRank(solveRank);

  const result = {
    passed: evaluation.passed,
    total: evaluation.total,
    test_results: evaluation.test_results,
  };

  await updateSubmission(submissionId, {
    status: 'ACCEPTED',
    result,
    solve_rank: solveRank,
    base_score: effectiveBaseScore,
    bonus_score: bonusScore,
  });

  const teamTotal = await getTeamTotalScore(teamId);
  await redis.zadd(`leaderboard:${env.COMPETITION_ID}`, teamTotal, teamId);

  emitToUserSockets(userId, 'submission:result', {
    submission_id: submissionId,
    question_id: questionId,
    round_id: roundId,
    status: 'ACCEPTED',
    result,
    score: {
      solve_rank: solveRank,
      base_score: effectiveBaseScore,
      bonus_score: bonusScore,
      total_score: effectiveBaseScore + bonusScore,
      team_total_score: teamTotal,
    },
  });

  emitToRoom(`comp:${env.COMPETITION_ID}`, 'leaderboard:update', {
    team_id: teamId,
    total_score: teamTotal,
    updated_submission_id: submissionId,
  });
}

async function processCompileJob(job) {
  const { submissionId, userId, questionId, roundId, teamId, jobType } = job.data;

  console.log('[compile-worker] picked job', {
    jobId: job.id,
    submissionId,
    jobType,
  });

  try {
    if (jobType === 'run') {
      await processRunJob(job);
      return;
    }

    if (jobType === 'submit') {
      await processSubmitJob(job);
      return;
    }

    console.log('[compile-worker] skipping unsupported jobType', { jobId: job.id, jobType });
  } catch (error) {
    console.error('[compile-worker] job processing failed', {
      jobId: job.id,
      submissionId,
      message: error.message,
    });

    const status = /timed out/i.test(error.message) ? 'TIMEOUT' : 'ERROR';
    const result = { error: error.message };

    await updateSubmission(submissionId, { status, result });

    if (jobType === 'submit') {
      await redis.del(dedupKey(teamId, questionId));
      emitToUserSockets(userId, 'submission:result', {
        submission_id: submissionId,
        question_id: questionId,
        round_id: roundId,
        status,
        result,
      });
    } else {
      emitToUserSockets(userId, 'run:result', {
        submission_id: submissionId,
        question_id: questionId,
        round_id: roundId,
        status,
        result,
      });
    }

    throw error;
  }
}

let compileWorkerRef = null;

export function startCompileWorker() {
  if (compileWorkerRef) {
    return compileWorkerRef;
  }

  const concurrency = Number(process.env.MAX_CONCURRENT_COMPILE_JOBS || 5);

  compileWorkerRef = new Worker('compile', processCompileJob, {
    connection: redis,
    concurrency,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  compileWorkerRef.on('failed', (job, err) => {
    const id = job?.id ? `job=${job.id}` : 'job=unknown';
    console.error(`[compile-worker] failed ${id}: ${err.message}`);
  });

  return compileWorkerRef;
}
