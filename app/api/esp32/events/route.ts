import { NextResponse, type NextRequest } from "next/server";
import { emitLine, getStatus, subscribe, type Esp32Event } from "@/lib/esp32";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15000;

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let finished = false;
      let unsubscribe = () => {};
      const timers: {
        heartbeat?: NodeJS.Timeout;
        status?: NodeJS.Timeout;
      } = {};

      cleanup = () => {
        if (finished) return;
        finished = true;
        if (timers.heartbeat) clearInterval(timers.heartbeat);
        if (timers.status) clearTimeout(timers.status);
        unsubscribe();
        req.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      };

      const write = (chunk: string) => {
        if (finished) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const send = (event: string, payload: unknown) =>
        write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

      send("status", getStatus());
      if (finished || req.signal.aborted) {
        cleanup();
        return;
      }

      unsubscribe = subscribe((frame: Esp32Event) => {
        send("frame", frame);
      });

      timers.status = setTimeout(() => send("status", getStatus()), 500);
      timers.heartbeat = setInterval(() => {
        send("status", getStatus());
        write(": ping\n\n");
      }, HEARTBEAT_MS);
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  let body: { raw?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.raw) {
    return NextResponse.json({ error: 'raw is required, e.g. "1"' }, { status: 400 });
  }

  const event = emitLine(body.raw);
  return NextResponse.json({ delivered: true, event, subscribers: getStatus().subscribers });
}
