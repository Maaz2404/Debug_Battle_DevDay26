import { redis } from '../config/redis.js';
import { HttpError, ok } from '../utils/http.js';

export async function checkRedis(req, res, next) {
  try {
    const pong = await redis.ping();
    return ok(res, { redis: pong, status: 'ok' }, 200);
  } catch (error) {
    return next(new HttpError(503, 'Redis unavailable', error.message));
  }
}
