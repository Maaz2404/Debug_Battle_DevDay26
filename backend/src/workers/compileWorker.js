import { Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { runCodeOnOneCompiler } from '../services/oneCompilerService.js';
import { emitToUserSockets } from '../socket/registry.js';

function normalizeOutput(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

async function updateSubmission(submissionId, fields) {
  console.log('[compile-worker] updating submission', {
    submissionId,
    fields,
  });

  const { error } = await supabaseAdmin
    .from('submissions')
    .update(fields)
    .eq('id', submissionId);

  if (error) {
    throw new Error(`Failed to update submission ${submissionId}: ${error.message}`);
  }
}

async function setRunPassKey({ teamId, questionId, roundId }) {
  const key = `runpass:${teamId}:${questionId}:${roundId}`;
  console.log('[compile-worker] setting runpass key', { key, ttl_seconds: 3600 });
  await redis.set(key, '1', 'EX', 3600);
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

  const testResults = [];

  for (const tc of testCases) {
    // Normalize testcase input/expected formats (support arrays in DB)
    const tcInputRaw = tc.input ?? '';
    const tcExpectedRaw = tc.expected_output ?? '';
    const tcInput = Array.isArray(tcInputRaw) ? tcInputRaw.join(' ') : String(tcInputRaw);
    const tcExpected = Array.isArray(tcExpectedRaw) ? tcExpectedRaw.join(' ') : String(tcExpectedRaw);

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
      input: tc.input ?? '',
      expected,
      actual,
      passed,
      stderr: normalizeOutput(execution.stderr),
    });
  }

  const passedCount = testResults.filter((tr) => tr.passed).length;
  const total = testResults.length;
  const allPassed = total > 0 && passedCount === total;

  const status = allPassed ? 'ACCEPTED' : 'WRONG_ANSWER';
  const result = {
    passed: passedCount,
    total,
    test_results: testResults,
  };

  console.log('[compile-worker] testcase evaluation complete', {
    submissionId,
    status,
    passed: passedCount,
    total,
  });

  await updateSubmission(submissionId, {
    status,
    result,
  });

  if (allPassed) {
    await setRunPassKey({ teamId, questionId, roundId });
  }

  emitToUserSockets(userId, 'run:result', {
    submission_id: submissionId,
    question_id: questionId,
    round_id: roundId,
    status,
    result,
  });

  console.log('[compile-worker] emitted run:result', {
    submissionId,
    userId,
    status,
  });
}

async function processCompileJob(job) {
  const { submissionId, userId, questionId, roundId, jobType } = job.data;

  console.log('[compile-worker] picked job', {
    jobId: job.id,
    submissionId,
    jobType,
  });

  if (jobType !== 'run') {
    console.log('[compile-worker] skipping unsupported jobType', { jobId: job.id, jobType });
    return;
  }

  try {
    await processRunJob(job);
  } catch (error) {
    console.error('[compile-worker] job processing failed', {
      jobId: job.id,
      submissionId,
      message: error.message,
    });

    const status = /timed out/i.test(error.message) ? 'TIMEOUT' : 'ERROR';
    const result = {
      error: error.message,
    };

    await updateSubmission(submissionId, {
      status,
      result,
    });

    emitToUserSockets(userId, 'run:result', {
      submission_id: submissionId,
      question_id: questionId,
      round_id: roundId,
      status,
      result,
    });

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
