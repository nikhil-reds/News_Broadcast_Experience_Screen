import type { NextRequest } from "next/server";
import { getStatus, subscribe, type NexmosphereEvent } from "@/lib/nexmosphere";

// Long-lived stream: must run on the Node runtime (native serial bindings) and
// must never be cached or statically prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15000;

/**
 * Server-sent event stream of Nexmosphere controller frames.
 * The browser listens with `new EventSource("/api/nexmosphere/events")`.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let finished = false;
      let unsubscribe = () => {};
      let heartbeat: NodeJS.Timeout | undefined = undefined;

      cleanup = () => {
        if (finished) return;
        finished = true;
        if (heartbeat) clearInterval(heartbeat);
        // Must always run, or the closed tab leaves a dead listener on the port.
        unsubscribe();
        req.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      const write = (chunk: string) => {
        if (finished) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Client vanished — tear the whole subscription down, don't just flag it.
          cleanup();
        }
      };

      const send = (event: string, payload: unknown) =>
        write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

      // Tell the page up front whether the cable is actually live.
      send("status", getStatus());

      // That first write can fail and run cleanup() already. Subscribing after
      // that point would attach a listener nothing is left to remove.
      if (finished || req.signal.aborted) {
        cleanup();
        return;
      }

      unsubscribe = subscribe((frame: NexmosphereEvent) => {
        send("frame", frame);
      });

      // Keeps proxies and the browser from tearing down an idle connection.
      heartbeat = setInterval(() => write(`: ping\n\n`), HEARTBEAT_MS);

      req.signal.addEventListener("abort", cleanup);
    },

    // Fires when the consumer walks away without aborting the request.
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable buffering in reverse proxies (nginx).
      "X-Accel-Buffering": "no",
    },
  });
}
