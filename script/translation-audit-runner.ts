import "dotenv/config";
import { translateSegmentTexts } from "../lib/translation";

const cases = [
  {
    id: "session-137-raw",
    text: "The current session general status remain processing, but the screen seeks required pipeline is complete and publishing the new footage directly and correctly",
  },
  {
    id: "illustrative-clean",
    text: "The current session is still processing. The required pipeline for this screen has completed, and the new footage is being published directly and correctly.",
  },
];
const languages = ["German", "Spanish", "French", "Hindi"];
const repetitions = Number(process.env.TRANSLATION_AUDIT_REPETITIONS || 3);

const results: unknown[] = [];

async function main() {
  for (const input of cases) {
    for (const language of languages) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        const started = performance.now();
        try {
          const [output] = await translateSegmentTexts([input.text], language);
          results.push({
            input: input.id,
            language,
            repetition,
            status: "ok",
            elapsedMs: Math.round(performance.now() - started),
            output,
          });
        } catch (error) {
          results.push({
            input: input.id,
            language,
            repetition,
            status: "error",
            elapsedMs: Math.round(performance.now() - started),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
  console.log(JSON.stringify({ model: process.env.QWEN_TRANSLATION_MODEL || process.env.QWEN_MODEL || "qwen2.5:3b", repetitions, results }));
}

main();
