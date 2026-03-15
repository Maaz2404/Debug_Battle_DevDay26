export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export function ok(res, data, status = 200) {
  return res.status(status).json({ data });
}

export function fail(res, status, message, details = null) {
  return res.status(status).json({ error: { message, details } });
}
