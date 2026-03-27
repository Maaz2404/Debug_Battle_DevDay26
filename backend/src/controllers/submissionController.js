import { getSubmissionStateById } from '../services/submissionStateService.js';
import { ok } from '../utils/http.js';

export async function getSubmissionStatus(req, res, next) {
  try {
    const submission = await getSubmissionStateById(req.params.submissionId, req.auth);
    return ok(res, submission, 200);
  } catch (error) {
    return next(error);
  }
}