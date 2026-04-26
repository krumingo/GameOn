/**
 * Retry an async operation with exponential backoff.
 * Skips retry on 4xx client errors (already failed validation/auth).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      // Do not retry client errors (validation, auth, paywall)
      if (status && status >= 400 && status < 500) throw e;
      if (i === maxRetries - 1) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}
