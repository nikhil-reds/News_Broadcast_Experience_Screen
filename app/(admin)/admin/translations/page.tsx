import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate, shortId } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminTranslationsPage() {
  const translations = await prisma.transcriptTranslation.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      transcript: { select: { language: true, text: true } },
      audio: { select: { id: true, url: true, voiceMode: true, speakerGender: true } },
    },
  });

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Translations" description="Translated transcript text and generated TTS audio." />
      <AdminTable headers={["Language", "Generation", "TTS", "Voice", "Source text", "Translation", "Created", "Asset"]} empty={translations.length === 0}>
        {translations.map((translation) => (
          <tr key={translation.id}>
            <Td>{translation.transcript.language} → {translation.language} ({translation.langCode})</Td>
            <Td>{shortId(translation.generationId)}</Td>
            <Td><StatusBadge value={translation.audio.length ? "ready" : "missing"} /></Td>
            <Td>{translation.audio.map(a => `${a.voiceMode} / ${a.speakerGender}`).join(", ") || "None"}</Td>
            <Td>
              <span className="inline-block max-w-xs truncate align-bottom">{translation.transcript.text}</span>
            </Td>
            <Td>
              <span className="inline-block max-w-xs truncate align-bottom">{translation.text}</span>
            </Td>
            <Td>{formatDate(translation.createdAt)}</Td>
            <Td>
              {translation.audio.length ? translation.audio.map(audio => (
                <Link key={audio.id} href={audio.url} className="font-semibold text-admin-accent">
                  {audio.speakerGender} 
                </Link>
              )) : (
                "None"
              )}
            </Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
