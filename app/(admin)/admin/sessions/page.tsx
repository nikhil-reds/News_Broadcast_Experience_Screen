import Link from "next/link";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminSessionsPage() {
  const sessions = await prisma.broadcastSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Sessions</h2>
        <p className="text-sm text-slate-500">Recording generations and selected output settings.</p>
      </div>
      <AdminTable
        headers={["Seq", "Status", "Pipeline", "Background", "Subtitle", "Audio", "Brightness", "Started", "Ended"]}
        empty={sessions.length === 0}
      >
        {sessions.map((session) => (
          <tr key={session.id}>
            <Td>
              <Link href={`/admin/sessions/${session.id}`} className="font-semibold text-blue-700">
                #{session.seq}
              </Link>
            </Td>
            <Td><StatusBadge value={session.status} /></Td>
            <Td><StatusBadge value={session.pipelineStatus} /></Td>
            <Td>{session.selectedBackgroundId ?? "None"}</Td>
            <Td>{session.selectedSubtitleLanguage}</Td>
            <Td>{session.selectedAudioLanguage}</Td>
            <Td>{session.selectedBrightness}%</Td>
            <Td>{formatDate(session.startedAt)}</Td>
            <Td>{formatDate(session.endedAt)}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
