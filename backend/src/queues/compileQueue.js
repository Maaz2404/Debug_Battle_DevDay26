import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';

export const compileQueue = new Queue('compile', {
  connection: redis,
});

export async function enqueueCompileJob(payload) {
  const job = await compileQueue.add('compile', payload, {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 2000,
    },
    removeOnComplete: 200,
    removeOnFail: 200,
  });

  console.log('[compile-queue] job enqueued', {
    jobId: job.id,
    submissionId: payload.submissionId,
    jobType: payload.jobType,
    questionId: payload.questionId,
    roundId: payload.roundId,
    userId: payload.userId,
  });

  return job;
}
