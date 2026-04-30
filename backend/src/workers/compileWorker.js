import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { runCodeOnOneCompiler } from '../services/oneCompilerService.js';
import { emitToRoom, emitToUserSockets } from '../socket/registry.js';

const leaderboardThrottleMs = Number(env.LEADERBOARD_BROADCAST_INTERVAL_MS || 1000);
let leaderboardCooldownActive = false;
let queuedLeaderboardRoundId = null;

function teamQuestionProgressKey(roundId, teamId, questionId) {
  return `live:progress:${roundId}:${teamId}:${questionId}`;
}

function normalizeOutput(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function collapseWhitespace(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function maybeNormalizeCase(value, ignoreCase) {
  if (!ignoreCase) {
    return value;
  }
  return String(value).toLowerCase();
}

function tryParseNumber(value) {
  const text = String(value ?? '').trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item));
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const output = {};
    for (const key of keys) {
      output[key] = canonicalizeJson(value[key]);
    }
    return output;
  }

  return value;
}

function tryParseJson(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }

  try {
    return canonicalizeJson(JSON.parse(text));
  } catch {
    return null;
  }
}

function compareByMode(actualRaw, expectedRaw, testCase = {}) {
  const mode = String(testCase.compare_mode || 'auto').toLowerCase();
  const ignoreCase = Boolean(testCase.ignore_case);
  const epsilon = Number.isFinite(Number(testCase.epsilon))
    ? Number(testCase.epsilon)
    : 1e-9;

  const actualNormalized = normalizeOutput(actualRaw);
  const expectedNormalized = normalizeOutput(expectedRaw);

  const exactActual = maybeNormalizeCase(actualNormalized, ignoreCase);
  const exactExpected = maybeNormalizeCase(expectedNormalized, ignoreCase);

  const passExact = () => ({
    passed: exactActual === exactExpected,
    actual: actualNormalized,
    expected: expectedNormalized,
    mode: 'exact',
  });

  const passTokens = () => {
    const tokenActual = maybeNormalizeCase(collapseWhitespace(actualRaw), ignoreCase);
    const tokenExpected = maybeNormalizeCase(collapseWhitespace(expectedRaw), ignoreCase);
    return {
      passed: tokenActual === tokenExpected,
      actual: collapseWhitespace(actualRaw),
      expected: collapseWhitespace(expectedRaw),
      mode: 'tokens',
    };
  };

  const passNumeric = () => {
    const a = tryParseNumber(actualRaw);
    const e = tryParseNumber(expectedRaw);
    if (a === null || e === null) {
      return {
        passed: false,
        actual: actualNormalized,
        expected: expectedNormalized,
        mode: 'numeric',
      };
    }

    return {
      passed: Math.abs(a - e) <= epsilon,
      actual: String(a),
      expected: String(e),
      mode: 'numeric',
    };
  };

  const passJson = () => {
    const a = tryParseJson(actualRaw);
    const e = tryParseJson(expectedRaw);
    if (a === null || e === null) {
      return {
        passed: false,
        actual: actualNormalized,
        expected: expectedNormalized,
        mode: 'json',
      };
    }

    return {
      passed: JSON.stringify(a) === JSON.stringify(e),
      actual: JSON.stringify(a),
      expected: JSON.stringify(e),
      mode: 'json',
    };
  };

  if (mode === 'exact') {
    return passExact();
  }

  if (mode === 'tokens') {
    return passTokens();
  }

  if (mode === 'numeric') {
    return passNumeric();
  }

  if (mode === 'json') {
    return passJson();
  }

  // auto mode
  const exact = passExact();
  if (exact.passed) {
    return exact;
  }

  const numeric = passNumeric();
  if (numeric.passed) {
    return numeric;
  }

  const json = passJson();
  if (json.passed) {
    return json;
  }

  return passTokens();
}

function chunkTestCases(testCases, maxCases, maxChars) {
  const chunks = [];
  let current = [];
  let currentChars = 0;

  for (const tc of testCases) {
    const tcChars = String(tc.input ?? '').length;
    const caseLimitReached = current.length >= maxCases;
    const charLimitReached = (currentChars + tcChars) > maxChars;

    if (current.length > 0 && (caseLimitReached || charLimitReached)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(tc);
    currentChars += tcChars;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
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
  const normalizedCases = (testCases || []).map((tc) => ({
    ...tc,
    input: toSpaceString(tc?.input ?? ''),
    expected_output: toSpaceString(tc?.expected_output ?? ''),
  }));

  const maxBatchCases = Math.max(1, Number(process.env.ONECOMPILER_MAX_BATCH_TESTCASES || 25));
  const maxBatchChars = Math.max(1000, Number(process.env.ONECOMPILER_MAX_BATCH_STDIN_CHARS || 30000));
  const chunks = chunkTestCases(normalizedCases, maxBatchCases, maxBatchChars);

  console.log('[compile-worker] evaluating testcases', {
    submissionId,
    total_cases: normalizedCases.length,
    chunk_count: chunks.length,
    max_batch_cases: maxBatchCases,
    max_batch_chars: maxBatchChars,
  });

  for (const chunk of chunks) {
    const inputs = chunk.map((tc) => tc.input);
    const executions = await runCodeOnOneCompiler({
      language,
      code,
      stdin: inputs,
    });

    const rows = Array.isArray(executions) ? executions : [executions];

    for (let i = 0; i < chunk.length; i += 1) {
      const tc = chunk[i];
      const execution = rows[i] || {};

      // Prefer stdout, but fall back to stderr when stdout is empty so
      // compiler errors appear as the "actual" output in test results.
      const actualRaw = normalizeOutput(execution?.stdout) || normalizeOutput(execution?.stderr) || '';
      const expectedRaw = String(tc.expected_output ?? '');
      const compared = compareByMode(actualRaw, expectedRaw, tc);

      const executionHasHardError = Boolean(execution?.error || execution?.exception)
        || String(execution?.status || '').toLowerCase() === 'failed';

      testResults.push({
        input: tc.input,
        expected: compared.expected,
        actual: compared.actual,
        passed: executionHasHardError ? false : compared.passed,
        compare_mode: compared.mode,
        stderr: normalizeOutput(execution?.stderr),
        exception: execution?.exception || null,
        error: execution?.error || null,
        execution_time_ms: Number(execution?.executionTime || 0),
      });
    }
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

async function getRoundQuestionIds(roundId) {
  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('id')
    .eq('round_id', roundId)
    .order('position', { ascending: true });

  if (error) {
    throw new Error(`Failed to load round question ids: ${error.message}`);
  }

  return (data || []).map((row) => row.id);
}

async function upsertTeamQuestionProgress({
  roundId,
  teamId,
  questionId,
  completed,
  completedAt,
  score,
  solveRank,
  submissionId,
}) {
  await redis.hset(teamQuestionProgressKey(roundId, teamId, questionId), {
    completed: completed ? '1' : '0',
    completed_at: completedAt || '',
    score: String(Number(score || 0)),
    solve_rank: String(Number(solveRank || 0)),
    submission_id: String(submissionId || ''),
    updated_at: new Date().toISOString(),
  });
}

async function buildLiveLeaderboardPayload(roundId) {
  const leaderboardKey = `leaderboard:${env.COMPETITION_ID}`;
  const raw = await redis.zrevrange(leaderboardKey, 0, 29, 'WITHSCORES');

  const teamEntries = [];
  const teamIds = [];
  for (let i = 0; i < raw.length; i += 2) {
    const teamId = raw[i];
    const score = Number(raw[i + 1] || 0);
    teamEntries.push({ teamId, score });
    teamIds.push(teamId);
  }

  const teamNamesMap = new Map();
  if (teamIds.length > 0) {
    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .in('id', teamIds);

    if (teamsError) {
      throw new Error(`Failed to load team names for leaderboard: ${teamsError.message}`);
    }

    for (const team of teams || []) {
      teamNamesMap.set(team.id, team.name);
    }
  }

  const questionIds = await getRoundQuestionIds(roundId);

  const rankings = await Promise.all(teamEntries.map(async (entry, index) => {
    const perQuestion = await Promise.all(questionIds.map(async (questionId) => {
      const progress = await redis.hgetall(teamQuestionProgressKey(roundId, entry.teamId, questionId));
      return {
        question_id: questionId,
        completed: progress?.completed === '1',
        completed_at: progress?.completed_at || null,
        score: Number(progress?.score || 0),
        solve_rank: Number(progress?.solve_rank || 0) || null,
        submission_id: progress?.submission_id || null,
      };
    }));

    return {
      rank: index + 1,
      team_id: entry.teamId,
      team_name: teamNamesMap.get(entry.teamId) || 'Unknown Team',
      total_score: entry.score,
      per_question: perQuestion,
    };
  }));

  return {
    round_id: roundId,
    generated_at: new Date().toISOString(),
    rankings,
  };
}

async function emitLeaderboardUpdateNow(roundId) {
  const leaderboardPayload = await buildLiveLeaderboardPayload(roundId);
  emitToRoom(`comp:${env.COMPETITION_ID}`, 'leaderboard:update', leaderboardPayload);
}

function scheduleLeaderboardUpdate(roundId) {
  if (!leaderboardCooldownActive) {
    leaderboardCooldownActive = true;
    emitLeaderboardUpdateNow(roundId).catch((error) => {
      console.error('[compile-worker] leaderboard emit failed', { message: error.message });
    });

    setTimeout(() => {
      leaderboardCooldownActive = false;
      if (queuedLeaderboardRoundId) {
        const nextRoundId = queuedLeaderboardRoundId;
        queuedLeaderboardRoundId = null;
        scheduleLeaderboardUpdate(nextRoundId);
      }
    }, Math.max(250, leaderboardThrottleMs));
    return;
  }

  queuedLeaderboardRoundId = roundId;
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

  await upsertTeamQuestionProgress({
    roundId,
    teamId,
    questionId,
    completed: false,
    completedAt: null,
    score: 0,
    solveRank: 0,
    submissionId,
  });

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

    await upsertTeamQuestionProgress({
      roundId,
      teamId,
      questionId,
      completed: false,
      completedAt: null,
      score: 0,
      solveRank: 0,
      submissionId,
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

  const result = {
    passed: evaluation.passed,
    total: evaluation.total,
    test_results: evaluation.test_results,
  };

  const acceptedCount = await countAcceptedSubmitForRank(questionId);
  const solveRank = acceptedCount + 1;
  const bonusScore = bonusByRank(solveRank);

  await updateSubmission(submissionId, {
    status: 'ACCEPTED',
    result,
    solve_rank: solveRank,
    base_score: effectiveBaseScore,
    bonus_score: bonusScore,
  });

  await upsertTeamQuestionProgress({
    roundId,
    teamId,
    questionId,
    completed: true,
    completedAt: new Date().toISOString(),
    score: effectiveBaseScore + bonusScore,
    solveRank,
    submissionId,
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

  scheduleLeaderboardUpdate(roundId);
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
