import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { minioClient, VIDEO_BUCKET } from "@/lib/minio";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job || job.status !== "completed" || !job.outputFilename) return Response.json({ error: "Export is not ready" }, { status: 404 });
  const stream = await minioClient.getObject(VIDEO_BUCKET, job.outputFilename);
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers: {
    "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename="${job.outputFilename.replace(/[^\w.-]/g, "_")}"`,
    "Cache-Control": "private, no-store",
    ...(job.size ? { "Content-Length": String(job.size) } : {}),
  } });
}
