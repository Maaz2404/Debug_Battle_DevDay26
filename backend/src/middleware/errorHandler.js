import { fail } from '../utils/http.js';

export function notFoundHandler(req, res) {
  return fail(res, 404, 'Route not found');
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = Number(err.status) || 500;
  const message = status >= 500 ? 'Internal server error' : err.message;
  const details = status >= 500 ? null : err.details || null;

  return fail(res, status, message, details);
}
