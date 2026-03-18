import IORedis from 'ioredis';
import { env } from './env.js';

if (!env.REDIS_URL) {
  throw new Error('Missing required environment variable: REDIS_URL');
}

// BullMQ requires maxRetriesPerRequest to be null for blocking commands.
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});
