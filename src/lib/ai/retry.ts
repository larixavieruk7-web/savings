/**
 * Generic retry utility with exponential backoff and jitter.
 * Used by OpenAI calls to handle transient API errors.
 *
 * Extracted from Distil (haisem-app) — works standalone.
 */

export interface RetryOptions {
  maxRetries?: number
  initialDelayMs?: number
  backoffMultiplier?: number
  maxDelayMs?: number
  isRetryable: (error: unknown) => boolean
  label?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function addJitter(delayMs: number): number {
  return delayMs + Math.random() * delayMs * 0.5
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 10_000,
    isRetryable,
    label = 'operation',
  } = options

  let lastError: unknown
  let delay = initialDelayMs

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= maxRetries || !isRetryable(error)) throw error

      const jitteredDelay = addJitter(Math.min(delay, maxDelayMs))
      console.warn(
        `[retry] ${label} attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(jitteredDelay)}ms: ${error instanceof Error ? error.message : String(error)}`,
      )
      await sleep(jitteredDelay)
      delay *= backoffMultiplier
    }
  }

  throw lastError
}

export function isRetryableOpenAIError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false
  const e = error as Record<string, unknown>
  const status = typeof e.status === 'number' ? e.status : 0
  return status === 429 || status === 500 || status === 502 || status === 503
}
