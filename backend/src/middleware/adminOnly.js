import { HttpError } from '../utils/http.js';

export function requireAdmin(req, res, next) {
  if (!req.auth) {
    return next(new HttpError(401, 'Unauthorized'));
  }

  if (req.auth.role !== 'admin') {
    return next(new HttpError(403, 'Admin role required'));
  }

  return next();
}
