"use client";

// Selection writes are serialized per endpoint. Apply waits for their acknowledgements
// and retries a failed latest write before advancing the shared workflow.
const writes = new Map<string, { promise: Promise<Response>; retry: () => Promise<Response> }>();
export function selectionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (!init?.method || init.method.toUpperCase() === "GET") return fetch(input, init);
  const previous = writes.get(url);
  const retry = () => fetch(input, init);
  const promise = (previous ? previous.promise.catch(() => undefined) : Promise.resolve()).then(retry);
  writes.set(url, { promise, retry });
  return promise;
}
export async function flushScreenSelections() {
  for (const [url, write] of writes) {
    let response = await write.promise.catch(() => null);
    if (writes.get(url) !== write) return flushScreenSelections();
    if (!response?.ok) {
      write.promise = write.retry();
      response = await write.promise.catch(() => null);
    }
    if (!response?.ok) throw new Error("Unable to save your selection. Please retry.");
    if (writes.get(url) !== write) return flushScreenSelections();
  }
}
