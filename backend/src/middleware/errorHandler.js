import { fail } from '../utils/http.js';

export function notFoundHandler(req, res) {
  return fail(res, 404, 'Route not found');
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = Number(err.status) || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = status >= 500 ? 'Internal server error' : err.message;
  const details = status >= 500
    ? (isProd ? null : (err.details || err.message || null))
    : (err.details || null);

  const requestContext = {
    method: req.method,
    path: req.originalUrl,
    status,
    message: err.message,
    details: err.details || null,
    stack: err.stack || null,
  };
  console.error('[api-error]', requestContext);

  return fail(res, status, message, details);
}
