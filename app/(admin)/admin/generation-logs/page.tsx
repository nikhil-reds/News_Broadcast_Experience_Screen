import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { GenerationLogStream } from "@/components/admin/generation-log-stream";

export default async function AdminGenerationLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; range?: string; source?: string; status?: string; query?: string }>;
}) {
  const { level, range, source, status, query } = await searchParams;
  const initialLevel = level || (status === "failed" ? "error" : status === "completed" ? "success" : status === "cancelled" ? "warning" : "all");
  const initialQuery = query || (status === "active" ? "processing" : status === "queued" ? "pending" : status === "cancelled" ? "cancelled" : "");
  return (
    <div className="space-y-5">
      <AdminPageHeader title="Generation Logs" description="Live stdout and stderr from npm run worker:all." />
      <GenerationLogStream initialLevel={initialLevel} initialRange={range} initialSource={source} initialQuery={initialQuery} />
    </div>
  );
}
