import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prisma } from "@/lib/prisma";
import {
  AUDIO_BUCKET,
  SPEAKER_REFERENCE_BUCKET,
  downloadObjectToFile,
  getObjectBuffer,
  uploadObject,
} from "@/lib/minio";
import { decodeMonoPcm16, extractAudioReferenceWav } from "@/lib/ffmpeg";

export type SpeakerGender = "male" | "female" | "unknown";

export interface SpeakerProfileResult {
  gender: SpeakerGender;
  confidence: number;
  pitchHz: number | null;
  referenceBucket: string;
  referenceObjectKey: string;
  referenceUrl: string;
}

const ANALYSIS_ENGINE = "ffmpeg-autocorrelation-v1";
const SAMPLE_RATE = 16000;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function estimatePitchHz(pcm: Buffer): { pitchHz: number | null; voicedRatio: number } {
  const samples = new Float32Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = pcm.readInt16LE(i * 2) / 32768;
  }

  const frameSize = Math.round(SAMPLE_RATE * 0.04);
  const hop = Math.round(SAMPLE_RATE * 0.02);
  const minLag = Math.floor(SAMPLE_RATE / 300);
  const maxLag = Math.floor(SAMPLE_RATE / 75);
  const pitches: number[] = [];
  let voicedFrames = 0;
  let totalFrames = 0;

  for (let offset = 0; offset + frameSize < samples.length; offset += hop) {
    totalFrames += 1;
    let energy = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const value = samples[offset + i];
      energy += value * value;
    }
    const rms = Math.sqrt(energy / frameSize);
    if (rms < 0.015) continue;

    let bestLag = 0;
    let bestScore = 0;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let correlation = 0;
      let aEnergy = 0;
      let bEnergy = 0;
      for (let i = 0; i < frameSize - lag; i += 1) {
        const a = samples[offset + i];
        const b = samples[offset + i + lag];
        correlation += a * b;
        aEnergy += a * a;
        bEnergy += b * b;
      }
      const score = correlation / Math.sqrt(aEnergy * bEnergy || 1);
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    if (bestScore >= 0.45 && bestLag > 0) {
      voicedFrames += 1;
      pitches.push(SAMPLE_RATE / bestLag);
    }
  }

  return {
    pitchHz: median(pitches),
    voicedRatio: totalFrames ? voicedFrames / totalFrames : 0,
  };
}

function classifyGender(pitchHz: number | null, voicedRatio: number): {
  gender: SpeakerGender;
  confidence: number;
} {
  if (!pitchHz || voicedRatio < 0.08) return { gender: "unknown", confidence: 0 };
  if (pitchHz <= 155) {
    return { gender: "male", confidence: Math.min(0.95, 0.55 + (155 - pitchHz) / 120 + voicedRatio / 5) };
  }
  if (pitchHz >= 185) {
    return { gender: "female", confidence: Math.min(0.95, 0.55 + (pitchHz - 185) / 120 + voicedRatio / 5) };
  }
  return { gender: "unknown", confidence: Math.min(0.5, 0.25 + voicedRatio / 5) };
}

export async function ensureSpeakerProfile(filename: string): Promise<SpeakerProfileResult> {
  const sourceAudio = `/api/asset/${AUDIO_BUCKET}/${encodeURIComponent(filename)}`;
  const audio = await prisma.audioFile.findUnique({ where: { filename }, include: { speakerProfile: true } });

  if (audio?.speakerProfile) {
    return {
      gender: audio.speakerProfile.gender as SpeakerGender,
      confidence: audio.speakerProfile.confidence,
      pitchHz: audio.speakerProfile.pitchHz,
      referenceBucket: audio.speakerProfile.referenceBucket,
      referenceObjectKey: audio.speakerProfile.referenceObjectKey,
      referenceUrl: audio.speakerProfile.referenceUrl,
    };
  }

  const workdir = await mkdtemp(join(tmpdir(), "speaker-profile-"));
  const inputPath = join(workdir, filename.replace(/[^\w.-]/g, "_"));
  const referencePath = join(workdir, "reference.wav");

  try {
    await downloadObjectToFile(AUDIO_BUCKET, filename, inputPath);
    await extractAudioReferenceWav({ input: inputPath, output: referencePath, duration: 12 });
    const pcm = await decodeMonoPcm16({ input: inputPath, duration: 30, sampleRate: SAMPLE_RATE });
    const { pitchHz, voicedRatio } = estimatePitchHz(pcm);
    const { gender, confidence } = classifyGender(pitchHz, voicedRatio);
    const referenceWav = await readFile(referencePath);
    const referenceObjectKey = `${filename}.voice-reference.v1.wav`;

    await uploadObject(SPEAKER_REFERENCE_BUCKET, referenceObjectKey, referenceWav, "audio/wav");
    const referenceUrl = `/api/asset/${SPEAKER_REFERENCE_BUCKET}/${encodeURIComponent(referenceObjectKey)}`;

    const savedAudio =
      audio ??
      (await prisma.audioFile.create({
        data: {
          filename,
          url: sourceAudio,
          bucket: AUDIO_BUCKET,
          objectKey: filename,
          size: (await getObjectBuffer(AUDIO_BUCKET, filename)).length,
        },
      }));

    await prisma.speakerProfile.upsert({
      where: { audioFileId: savedAudio.id },
      create: {
        audioFileId: savedAudio.id,
        generationId: savedAudio.sessionId,
        gender,
        confidence,
        pitchHz,
        referenceBucket: SPEAKER_REFERENCE_BUCKET,
        referenceObjectKey,
        referenceUrl,
        analysisEngine: ANALYSIS_ENGINE,
      },
      update: {
        generationId: savedAudio.sessionId,
        gender,
        confidence,
        pitchHz,
        referenceBucket: SPEAKER_REFERENCE_BUCKET,
        referenceObjectKey,
        referenceUrl,
        analysisEngine: ANALYSIS_ENGINE,
      },
    });

    return { gender, confidence, pitchHz, referenceBucket: SPEAKER_REFERENCE_BUCKET, referenceObjectKey, referenceUrl };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
