import "dotenv/config";
import { prisma } from "@/lib/prisma";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const id = process.argv[2] || (await prisma.broadcastSession.findFirst({ orderBy: { seq: "desc" }, select: { id: true } }))?.id;
  if (!id) throw new Error("no generation found");
  for (let i = 0; i < 24; i += 1) {
    const rows = await prisma.generationTask.findMany({ where: { generationId: id }, select: { taskType: true, status: true, createdAt: true, startedAt: true, completedAt: true, errorMessage: true }, orderBy: { createdAt: "asc" } });
    console.log(JSON.stringify(rows));
    if (rows.length > 0 && rows.every((row) => ["completed", "failed", "cancelled"].includes(row.status))) break;
    await sleep(5000);
  }
  await prisma.$disconnect();
}
main();
