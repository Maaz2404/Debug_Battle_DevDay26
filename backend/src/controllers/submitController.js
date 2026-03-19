import { submitCodeJob } from '../services/submitService.js';
import { ok } from '../utils/http.js';

export async function submitCode(req, res, next) {
  try {
    console.log('[submit-controller] request received', {
      team_id: req.auth?.team_id || null,
      user_id: req.auth?.user_id || null,
      roundId: req.body?.roundId || null,
      questionId: req.body?.questionId || null,
      language: req.body?.language || null,
      code_length: typeof req.body?.code === 'string' ? req.body.code.length : null,
    });

    const result = await submitCodeJob(req.body || {}, req.auth);
    console.log('[submit-controller] request accepted', result);
    return ok(res, result, 202);
  } catch (error) {
    console.error('[submit-controller] request failed', {
      message: error.message,
      status: error.status || 500,
      details: error.details || null,
    });
    return next(error);
  }
}
