// Copies completed assets only. Never imports workers, queues or model code.
import { mkdir, writeFile, readFile, rename, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, dirname, resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import Redis from "ioredis";
import { Client } from "minio";

process.loadEnvFile();
const root = resolve("public/demo/snapshot");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis({ host: process.env.REDIS_HOST || "localhost", port: Number(process.env.REDIS_PORT || 6379), maxRetriesPerRequest: 1 });
redis.on("error", () => {});
const minio = new Client({ endPoint: process.env.MINIO_ENDPOINT || "localhost", port: Number(process.env.MINIO_PORT || 9000), useSSL: process.env.MINIO_USE_SSL === "true", accessKey: process.env.MINIO_ACCESS_KEY || "admin", secretKey: process.env.MINIO_SECRET_KEY || "password123" });
const videoBucket = process.env.MINIO_BUCKET_VIDEO || "videos";
const transcriptBucket = process.env.MINIO_BUCKET_TRANSCRIPTS || "transcripts";
const assets = {};
let copied = 0;

async function copyAsset(bucket, key, preserveName) {
  const identity = `${bucket}/${key}`;
  if (assets[identity]) return assets[identity];
  const info = await minio.statObject(bucket, key);
  if (!info.size) throw new Error(`Empty saved asset: ${identity}`);
  const hash = createHash("sha256").update(`${identity}:${info.etag}`).digest("hex").slice(0, 20);
  const name = preserveName ? `${hash}/${key.split("/").pop()}` : `${hash}${extname(key)}`;
  const destination = resolve(root, "assets", name);
  if (!destination.startsWith(root + "/") && !destination.startsWith(root + "\\")) throw new Error("Invalid asset path");
  await mkdir(dirname(destination), { recursive: true });
  const existing = await stat(destination).catch(() => null);
  if (existing?.size !== info.size) {
    await pipeline(await minio.getObject(bucket, key), createWriteStream(destination + ".partial"));
    await rename(destination + ".partial", destination);
  }
  const url = `/demo/snapshot/assets/${name.split("/").map(encodeURIComponent).join("/")}`;
  assets[identity] = url;
  copied++;
  return url;
}
async function jsonObject(bucket, key) {
  const chunks = [];
  for await (const chunk of await minio.getObject(bucket, key)) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function remap(cues, cuts) {
  let offset = 0;
  return cuts.flatMap(cut => {
    const result = cues.filter(cue => cue.end > cut.start && cue.start < cut.end).map(cue => ({
      start: offset + Math.max(cue.start, cut.start) - cut.start,
      end: offset + Math.min(cue.end, cut.end) - cut.start, text: cue.text,
    }));
    offset += cut.end - cut.start;
    return result;
  });
}
try {
  if (await redis.get("broadcast:saved-demo:state").then(raw => raw && JSON.parse(raw).active)) throw new Error("End Demo before replacing its saved footage.");
  const id = process.argv[2] || await redis.get("broadcast:active-session-id");
  const session = (await pool.query('select * from broadcast_sessions where id = $1', [id])).rows[0];
  if (!session || session.retiredAt || session.pipelineStatus !== "ready") throw new Error("The current session must have completed processing before it can be saved.");
  const videos = (await pool.query('select * from video_recordings where "sessionId"=$1 order by "createdAt" desc', [id])).rows;
  const audioRows = (await pool.query('select * from audio_files where "sessionId"=$1 order by "createdAt" desc', [id])).rows;
  const reel = videos.find(row => row.filename.startsWith("highlight-"));
  if (!reel || !audioRows.length || !["camera-recording-", "camera2-recording-", "camera3-recording-"].every(prefix => videos.some(row => row.filename.startsWith(prefix)))) throw new Error("Three cameras, master audio and a completed reel are required.");
  const media = async row => ({ filename: row.filename, url: await copyAsset(row.bucket, row.objectKey || row.filename, true), size: row.size, createdAt: row.createdAt });
  const recordings = []; for (const row of videos) recordings.push(await media(row));
  const audioFiles = []; for (const row of audioRows) audioFiles.push(await media(row));
  const translations = [];
  for (const row of (await pool.query('select * from translation_audio where "generationId"=$1 order by "createdAt" desc', [id])).rows) {
    translations.push({ language: row.language, langCode: row.langCode, voiceId: row.voiceId, url: await copyAsset(row.bucket, row.objectKey, true) });
  }
  const transcript = (await pool.query('select * from transcripts where "generationId"=$1 order by "createdAt" desc limit 1', [id])).rows[0];
  if (!transcript) throw new Error("Completed transcript is missing.");
  const english = (await pool.query('select "segmentIndex" as id, start, "end", text from transcript_segments where "transcriptId"=$1 order by "segmentIndex"', [transcript.id])).rows;
  const transcripts = { English: { text: transcript.text, language: "en", duration: transcript.duration, segments: english, createdAt: transcript.createdAt, sourceAudio: audioFiles[0].url } };
  for (const row of (await pool.query('select * from transcript_translations where "transcriptId"=$1', [transcript.id])).rows) {
    const segments = (await pool.query('select "segmentIndex" as id, start, "end", text from transcript_translation_segments where "translationId"=$1 order by "segmentIndex"', [row.id])).rows;
    transcripts[row.language] = { text: row.text, language: row.langCode, duration: transcript.duration, segments, createdAt: row.createdAt, sourceAudio: audioFiles[0].url };
    await copyAsset(row.bucket, row.objectKey);
  }
  const sidecar = await jsonObject(transcriptBucket, `${reel.objectKey}.json`);
  await copyAsset(transcriptBucket, `${reel.objectKey}.json`);
  const cues = Object.fromEntries(Object.entries(transcripts).map(([language, value]) => [language, remap(value.segments, sidecar.segments)]));
  const backgrounds = JSON.parse(await readFile("public/backgrounds/manifest.json", "utf8"));
  const composites = {};
  const stamp = reel.filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  for (const bg of backgrounds) {
    const key = `composites/${process.env.GREEN_SCREEN_MATTING_VERSION || "rvm-v1"}/${stamp}/${bg.id}`;
    const url = await copyAsset(videoBucket, `${key}.mp4`);
    const metadata = await jsonObject(videoBucket, `${key}.json`).catch(() => ({}));
    composites[bg.id] = { url, fallback: metadata.fallback ?? null, fallbackReason: metadata.fallbackReason ?? null };
  }
  const selections = {};
  for (const kind of ["background", "subtitle-language", "industry", "industry-preview", "brand"]) {
    const raw = await redis.get(`broadcast:session:${id}:${kind}`);
    if (raw) selections[kind] = JSON.parse(raw).value;
  }
  const audioSelection = JSON.parse(await redis.get(`broadcast:session:${id}:audio-language`) || "null");
  const snapshot = {
    version: 2, sourceSessionId: id, createdAt: new Date().toISOString(),
    session: { id, seq: session.seq, status: "ready", pipelineStatus: "ready", selectedBackgroundId: session.selectedBackgroundId || backgrounds[0].id, selectedSubtitleLanguage: session.selectedSubtitleLanguage, selectedAudioLanguage: session.selectedAudioLanguage, selectedBrightness: session.selectedBrightness, startedAt: session.startedAt, endedAt: session.endedAt },
    recordings, audioFiles, translations, transcripts, cues, composites, selections,
    voiceId: audioSelection?.voiceId || "indian-male-01", assets,
  };
  if (!transcripts[session.selectedSubtitleLanguage] || (session.selectedAudioLanguage !== "English" && !translations.some(row => row.language === session.selectedAudioLanguage && row.voiceId === snapshot.voiceId))) throw new Error("Selected audio or captions are not already rendered; no workers were started.");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "snapshot.json.partial"), JSON.stringify(snapshot, null, 2) + "\n");
  await rename(join(root, "snapshot.json.partial"), join(root, "snapshot.json"));
  console.log(`Saved session ${id}: ${copied} completed assets, ${Object.keys(transcripts).length} transcripts, ${Object.keys(composites).length} backgrounds. No workers queued.`);
} finally { await pool.end(); redis.disconnect(); }
