import Link from "next/link";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatBytes, formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminAudioPage() {
  const audioFiles = await prisma.audioFile.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      session: { select: { seq: true } },
      speakerProfile: { select: { gender: true, confidence: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Audio</h2>
        <p className="text-sm text-slate-500">Master audio files and voice profile status.</p>
      </div>
      <AdminTable headers={["Filename", "Session", "Duration", "Size", "Speaker", "Created", "Asset"]} empty={audioFiles.length === 0}>
        {audioFiles.map((audio) => (
          <tr key={audio.id}>
            <Td>{audio.filename}</Td>
            <Td>{audio.session ? `#${audio.session.seq}` : "None"}</Td>
            <Td>{audio.duration ? `${audio.duration.toFixed(1)}s` : "Unknown"}</Td>
            <Td>{formatBytes(audio.size)}</Td>
            <Td>
              <StatusBadge value={audio.speakerProfile ? audio.speakerProfile.gender : "missing"} />
            </Td>
            <Td>{formatDate(audio.createdAt)}</Td>
            <Td>
              <Link href={audio.url} className="font-semibold text-blue-700">
                View
              </Link>
            </Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
