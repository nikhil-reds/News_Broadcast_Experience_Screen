/**
 * Generic module-scope debounce: rapid calls sharing the same `key` coalesce
 * into a single `fn()` invocation ~`delayMs` after the *last* call, and every
 * caller waiting on that key resolves with that one shared result.
 *
 * Used to implement "wait 500-1000ms after the last change, then generate
 * only the latest requested configuration" for operator-driven variant jobs
 * (Screen 07 background swap, Screen 11/12 video export) — see
 * docs/generation-pipeline.md.
 */

interface DebounceEntry {
  timer: ReturnType<typeof setTimeout>;
  resolvers: Array<(value: unknown) => void>;
}

const timers = new Map<string, DebounceEntry>();

export function debounce<T>(key: string, delayMs: number, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    const existing = timers.get(key);
    if (existing) clearTimeout(existing.timer);

    const resolvers = existing ? existing.resolvers : [];
    resolvers.push(resolve as (value: unknown) => void);

    const timer = setTimeout(async () => {
      timers.delete(key);
      const result = await fn();
      resolvers.forEach((r) => r(result));
    }, delayMs);

    timers.set(key, { timer, resolvers });
  });
}
