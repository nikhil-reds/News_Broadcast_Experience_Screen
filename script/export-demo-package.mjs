import { mkdir, copyFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { Client as MinioClient } from "minio";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

process.loadEnvFile();

const ROOT = process.cwd();
const OUTPUT = join(ROOT, "public", "demo");
const SESSION_ID = process.argv[2];

if (!SESSION_ID) throw new Error("Usage: node script/export-demo-package.mjs <session-id>");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "admin",
  secretKey: process.env.MINIO_SECRET_KEY || "password123",
});

async function download(bucket, key, destination) {
  await pipeline(await minio.getObject(bucket, key), createWriteStream(destination));
}

async function padAudio(input, output, durationMs) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-af", "apad", "-t", (durationMs / 1000).toFixed(3), output,
    ]);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
  });
}

function cameraNumber(filename) {
  if (filename.startsWith("camera3-recording-")) return 3;
  if (filename.startsWith("camera2-recording-")) return 2;
  if (filename.startsWith("camera-recording-")) return 1;
  return null;
}

try {
  const sessionResult = await pool.query(
    'select * from broadcast_sessions where id = $1',
    [SESSION_ID],
  );
  const session = sessionResult.rows[0];
  if (!session) throw new Error(`Unknown session ${SESSION_ID}`);

  const videoResult = await pool.query(
    'select * from video_recordings where "sessionId" = $1 order by "createdAt" desc',
    [SESSION_ID],
  );
  const cameras = videoResult.rows.filter((row) => cameraNumber(row.filename));
  const reel = videoResult.rows.find((row) => row.filename.startsWith("highlight-"));
  if (cameras.length < 3 || !reel) throw new Error("Session does not contain three cameras and a highlight reel");

  const audioResult = await pool.query(
    'select * from audio_files where "sessionId" = $1 order by "createdAt" desc limit 1',
    [SESSION_ID],
  );
  const audio = audioResult.rows[0];
  if (!audio) throw new Error("Session does not contain master audio");

  const translationResult = await pool.query(
    `select ta.bucket, ta."objectKey", ta."voiceId", tt.id
       from transcript_translations tt
       join translation_audio ta on ta."translationId" = tt.id
      where tt."generationId" = $1 and tt.language = $2
      order by ta."createdAt" desc limit 1`,
    [SESSION_ID, session.selectedAudioLanguage],
  );
  const translatedAudio = translationResult.rows[0] || null;

  const captionResult = await pool.query(
    `select tts.start, tts.end, tts.text
       from transcript_translations tt
       join transcript_translation_segments tts on tts."translationId" = tt.id
      where tt."generationId" = $1 and tt.language = $2
      order by tts."segmentIndex"`,
    [SESSION_ID, session.selectedSubtitleLanguage],
  );

  const sidecarStream = await minio.getObject("transcripts", `${reel.objectKey}.json`);
  const sidecarParts = [];
  for await (const part of sidecarStream) sidecarParts.push(part);
  const sidecar = JSON.parse(Buffer.concat(sidecarParts).toString("utf8"));

  await Promise.all([
    mkdir(join(OUTPUT, "cameras"), { recursive: true }),
    mkdir(join(OUTPUT, "audio"), { recursive: true }),
    mkdir(join(OUTPUT, "backgrounds"), { recursive: true }),
    mkdir(join(OUTPUT, "images"), { recursive: true }),
  ]);

  const cameraFiles = {};
  for (const row of cameras) {
    const number = cameraNumber(row.filename);
    const filename = `camera-${number}.mp4`;
    await download(row.bucket, row.objectKey, join(OUTPUT, "cameras", filename));
    cameraFiles[number] = `/demo/cameras/${filename}`;
  }

  const durationMs = Math.round(sidecar.validation.videoDuration * 1000);
  const audioFile = translatedAudio ? "programme-de.wav" : "programme.wav";
  const audioSource = translatedAudio || audio;
  const audioPath = join(OUTPUT, "audio", audioFile);
  const audioInputPath = join(OUTPUT, "audio", `source-${audioFile}`);
  await download(audioSource.bucket, audioSource.objectKey || audioSource.filename, audioInputPath);
  await padAudio(audioInputPath, audioPath, durationMs);
  await rm(audioInputPath);

  const backgroundFile = `${session.selectedBackgroundId || "bg-newsroom-1920x1080"}.png`;
  await copyFile(join(ROOT, "public", "backgrounds", backgroundFile), join(OUTPUT, "backgrounds", backgroundFile));

  const adSources = [
    ["Amazon bottom band.png", "amazon-bottom.png"],
    ["Amazon L band.png", "amazon-l-band.png"],
    ["Amazon side band.png", "amazon-side.png"],
  ];
  for (const [source, destination] of adSources) {
    await copyFile(
      join(ROOT, "public", "ads", "industry", "RETAIL & E-COMMERCE", "Amazon", source),
      join(OUTPUT, "images", destination),
    );
  }

  const cuts = sidecar.segments.map((segment, index) => ({
    at: Math.round(sidecar.segments.slice(0, index).reduce((sum, item) => sum + item.end - item.start, 0) * 1000),
    type: "camera",
    camera: segment.camera,
    sourceTime: Math.round(segment.start * 1000),
    transition: index === 0 ? "cut" : "dissolve",
  }));
  const timeline = {
    version: 1,
    durationMs,
    events: [
      { at: 0, type: "settings", background: backgroundFile, brightness: session.selectedBrightness },
      ...cuts,
      { at: 0, type: "caption-track", language: session.selectedSubtitleLanguage },
      { at: 0, type: "ad", image: "amazon-bottom.png" },
      { at: 8000, type: "ad", image: "amazon-l-band.png" },
      { at: 16000, type: "ad", image: "amazon-side.png" },
      { at: durationMs, type: "finish" },
    ],
  };
  const manifest = {
    version: 1,
    title: "Saved News Broadcast Demo",
    sourceSessionId: SESSION_ID,
    createdAt: new Date().toISOString(),
    durationMs,
    cameras: [1, 2, 3].map((id) => ({ id, src: cameraFiles[id], offsetMs: 0, muted: true })),
    audio: { src: `/demo/audio/${audioFile}`, offsetMs: 0, volume: 1, language: session.selectedAudioLanguage },
    background: `/demo/backgrounds/${backgroundFile}`,
    captions: "/demo/captions.json",
    timeline: "/demo/timeline.json",
    initial: {
      camera: cuts[0].camera,
      brightness: session.selectedBrightness,
      subtitleLanguage: session.selectedSubtitleLanguage,
      brand: "Amazon",
    },
  };

  await Promise.all([
    writeFile(join(OUTPUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
    writeFile(join(OUTPUT, "timeline.json"), JSON.stringify(timeline, null, 2) + "\n"),
    writeFile(join(OUTPUT, "captions.json"), JSON.stringify(captionResult.rows, null, 2) + "\n"),
  ]);
  console.log(`Exported demo package for session ${SESSION_ID}`);
} finally {
  await pool.end();
}
