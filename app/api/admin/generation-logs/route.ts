import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth";

const RANGE_MS = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
} as const;

type DisplayLevel = "error" | "warning" | "success" | "info";
type WorkerLog = {
  id: string;
  timestamp: string;
  level: DisplayLevel;
  stream: "stdout" | "stderr";
  source: string;
  message: string;
};

function displayLevel(stream: "stdout" | "stderr", message: string): DisplayLevel {
  const value = message.toLowerCase();
  if (stream === "stderr" || /\b(failed|failure|error|exception|fatal|unavailable)\b/.test(value)) return "error";
  if (/\b(warn|warning|waiting|retry|stale|degraded|cancelled)\b/.test(value)) return "warning";
  if (/\b(completed|ready|listening|connected|passed|healthy|published)\b/.test(value)) return "success";
  return "info";
}

function parseLine(line: string, index: number): WorkerLog | null {
  const match = line.match(/^(\S+)\s+(INFO|WARN|ERROR)\s+\[([^\]]+)]\s+(.*)$/);
  if (!match) return null;
  const [, timestamp, rawLevel, source, message] = match;
  const stream = rawLevel === "ERROR" ? "stderr" : "stdout";
  return {
    id: `${timestamp}-${index}`,
    timestamp,
    level: displayLevel(stream, message),
    stream,
    source,
    message,
  };
}

export async function GET(request: NextRequest) {
  await verifyAdminSession();

  const params = request.nextUrl.searchParams;
  const range = params.get("range") || "1h";
  const level = params.get("level") || (params.get("status") === "failed" ? "error" : "all");
  const source = params.get("source") || "all";
  const sort = params.get("sort") === "asc" ? "asc" : "desc";
  const query = (params.get("query") || "").trim().toLowerCase().slice(0, 160);
  const logFile = path.join(process.cwd(), "logs", "worker-all.log");

  let content = "";
  let updatedAt: string | null = null;
  try {
    const [file, details] = await Promise.all([readFile(logFile, "utf8"), stat(logFile)]);
    content = file;
    updatedAt = details.mtime.toISOString();
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") throw error;
  }

  const cutoff = range in RANGE_MS ? Date.now() - RANGE_MS[range as keyof typeof RANGE_MS] : null;
  let logs = content
    .split(/\r?\n/)
    .map(parseLine)
    .filter((entry): entry is WorkerLog => Boolean(entry))
    .filter((entry) => cutoff == null || Date.parse(entry.timestamp) >= cutoff)
    .filter((entry) => level === "all" || entry.level === level)
    .filter((entry) => source === "all" || entry.source === source)
    .filter((entry) => !query || `${entry.source} ${entry.stream} ${entry.message}`.toLowerCase().includes(query));

  logs = logs.sort((left, right) => {
    const delta = Date.parse(left.timestamp) - Date.parse(right.timestamp);
    return sort === "asc" ? delta : -delta;
  });

  const sources = [...new Set(content.split(/\r?\n/).map((line) => line.match(/^\S+\s+\S+\s+\[([^\]]+)]/)?.[1]).filter((value): value is string => Boolean(value)))].sort();

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    fileUpdatedAt: updatedAt,
    fileAvailable: Boolean(content),
    pollAfterMs: 2_000,
    sources,
    logs,
    summary: {
      total: logs.length,
      errors: logs.filter((entry) => entry.level === "error").length,
      warnings: logs.filter((entry) => entry.level === "warning").length,
      sources: new Set(logs.map((entry) => entry.source)).size,
    },
  });
}
