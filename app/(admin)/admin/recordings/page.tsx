import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { formatBytes, formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminRecordingsPage() {
  const recordings = await prisma.videoRecording.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { session: { select: { seq: true } } },
  });

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Recordings" description="Camera and studio video files stored for each generation." />
      <AdminTable headers={["Filename", "Session", "Type", "Size", "Created", "Asset"]} empty={recordings.length === 0}>
        {recordings.map((recording) => (
          <tr key={recording.id}>
            <Td>{recording.filename}</Td>
            <Td>{recording.session ? `#${recording.session.seq}` : "None"}</Td>
            <Td>{recording.contentType ?? "Unknown"}</Td>
            <Td>{formatBytes(recording.size)}</Td>
            <Td>{formatDate(recording.createdAt)}</Td>
            <Td>
              <Link href={recording.url} className="font-semibold text-admin-accent">
                View
              </Link>
            </Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
