export interface ApiErrorOptions {
  message: string;
  status?: number | null;
  code?: string | null;
  isNetworkError?: boolean;
  isTimeout?: boolean;
  isUnauthorized?: boolean;
  cause?: unknown;
}

export class ApiError extends Error {
  public readonly status: number | null;
  public readonly code: string | null;
  public readonly isNetworkError: boolean;
  public readonly isTimeout: boolean;
  public readonly isUnauthorized: boolean;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.isNetworkError = Boolean(options.isNetworkError);
    this.isTimeout = Boolean(options.isTimeout);
    this.isUnauthorized = Boolean(options.isUnauthorized);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
