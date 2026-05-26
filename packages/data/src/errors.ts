// Provider-layer errors. Adapters NEVER throw raw fetch errors at consumers;
// they normalise to one of these so route handlers and AI tools have a
// stable surface to react on.

import { providerUnavailable } from '@hamafx/shared';

export type DataErrorCode =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_PARSE_ERROR'
  | 'PROVIDER_QUOTA_EXCEEDED'
  | 'NO_PROVIDER_AVAILABLE';

export class ProviderError extends Error {
  override readonly cause?: unknown;
  readonly code: DataErrorCode;
  readonly provider: string;
  readonly status?: number;

  constructor(
    code: DataErrorCode,
    provider: string,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.provider = provider;
    if (options.status !== undefined) this.status = options.status;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/** Lift a ProviderError to the public AppError envelope. */
export function toAppError(err: ProviderError): ReturnType<typeof providerUnavailable> {
  return providerUnavailable(`Data provider failed: ${err.provider} (${err.code})`, {
    code: err.code,
    provider: err.provider,
    status: err.status,
  });
}
