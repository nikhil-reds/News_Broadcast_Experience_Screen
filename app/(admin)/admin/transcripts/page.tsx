import { AdminTable, Td } from "@/components/admin/admin-table";
import { formatDate, shortId } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminTranscriptsPage() {
  const transcripts = await prisma.transcript.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      audioFile: { select: { filename: true } },
      segments: { select: { id: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Transcripts</h2>
        <p className="text-sm text-slate-500">Speech-to-text output and segment counts.</p>
      </div>
      <AdminTable headers={["Language", "Source", "Generation", "Duration", "Segments", "Engine", "Preview", "Created"]} empty={transcripts.length === 0}>
        {transcripts.map((transcript) => (
          <tr key={transcript.id}>
            <Td>{transcript.language}</Td>
            <Td>{transcript.audioFile?.filename ?? transcript.sourceAudio}</Td>
            <Td>{shortId(transcript.generationId)}</Td>
            <Td>{transcript.duration.toFixed(1)}s</Td>
            <Td>{transcript.segments.length}</Td>
            <Td>{transcript.sttEngine}</Td>
            <Td>
              <span className="inline-block max-w-xs truncate align-bottom">{transcript.text}</span>
            </Td>
            <Td>{formatDate(transcript.createdAt)}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
