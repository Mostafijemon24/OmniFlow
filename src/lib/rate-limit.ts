/**
 * Fixed-window rate limiter held in process memory.
 *
 * Enough to stop one session hammering an endpoint on a single-instance
 * deployment. It does not survive a restart and is not shared between
 * instances, so it is a speed bump rather than a security control — the
 * uniqueness and ownership checks behind it are what actually protect the data.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Keeps the map from growing without bound on a long-lived process. */
export function pruneRateLimits() {
  const now = Date.now();
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}
