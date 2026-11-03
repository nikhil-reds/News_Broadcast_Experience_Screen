import "dotenv/config";
import { enqueueHighlightAnalysis } from "@/lib/queue";

const [cam1Filename, cam2Filename, cam3Filename, generationId] = process.argv.slice(2);
if (!cam1Filename || !cam2Filename || !cam3Filename || !generationId) {
  throw new Error("Usage: tsx script/rerun-continuous-highlight.ts <cam1> <cam2> <cam3> <generationId>");
}

// This named revision is intentionally separate from the existing reel. The
// UI switches only after the new asset and its dependent composites are ready.
async function main() {
  await enqueueHighlightAnalysis(cam1Filename, cam2Filename, cam3Filename, generationId, "continuous-v1");
  console.log("Queued continuous-v1 highlight analysis.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
