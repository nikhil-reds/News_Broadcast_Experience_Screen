import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";
import { getDemoState, startDemo, stopDemo, type DemoSource } from "@/lib/demo-control";

const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });

export async function GET() {
  await verifyAdminSession();
  return response(await getDemoState());
}

export async function POST(request: NextRequest) {
  await verifyAdminSession();
  try {
    const body = await request.json().catch(() => ({})) as { source?: unknown };
    const source: DemoSource = body.source === "newest" ? "newest" : body.source === "latest" ? "latest" : "saved";
    return response(await startDemo(source));
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Unable to start demo" }, 409);
  }
}

export async function DELETE() {
  await verifyAdminSession();
  try {
    return response(await stopDemo("manual"));
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Unable to end demo" }, 409);
  }
}
