export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface EnvelopeSuccess<T> {
  data: T;
}

interface EnvelopeError {
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    cache: "no-store",
  });

  let parsed: EnvelopeSuccess<T> | EnvelopeError | null = null;
  try {
    parsed = (await response.json()) as EnvelopeSuccess<T> | EnvelopeError;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsed && "error" in parsed && parsed.error?.message
      ? parsed.error.message
      : `Request failed with status ${response.status}`;
    const details = parsed && "error" in parsed ? parsed.error?.details : null;
    throw new ApiError(response.status, message, details);
  }

  if (!parsed || !("data" in parsed)) {
    throw new ApiError(500, "Malformed API response", parsed);
  }

  return parsed.data;
}
