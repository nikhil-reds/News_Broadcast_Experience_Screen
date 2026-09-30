import Link from "next/link";
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
      <div>
        <h2 className="text-2xl font-bold">Recordings</h2>
        <p className="text-sm text-slate-500">Camera and studio video files stored for each generation.</p>
      </div>
      <AdminTable headers={["Filename", "Session", "Type", "Size", "Created", "Asset"]} empty={recordings.length === 0}>
        {recordings.map((recording) => (
          <tr key={recording.id}>
            <Td>{recording.filename}</Td>
            <Td>{recording.session ? `#${recording.session.seq}` : "None"}</Td>
            <Td>{recording.contentType ?? "Unknown"}</Td>
            <Td>{formatBytes(recording.size)}</Td>
            <Td>{formatDate(recording.createdAt)}</Td>
            <Td>
              <Link href={recording.url} className="font-semibold text-blue-700">
                View
              </Link>
            </Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
