import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runWhisper } from "./transcribe";
import { translateSegmentTexts } from "./qwen";
import { synthesizeChatterbox, concatWav, type ChatterboxLanguage } from "./chatterbox";
import { splitTtsText } from "./tts-chunking";
import { extractAudioReferenceWav, fitDubTrack, probeDurationSeconds } from "./ffmpeg";
import { EXPORT_AUDIO_LABELS } from "./export-settings";
import type { VoiceId } from "./voice-profiles";

export interface DubCue { start: number; end: number; text: string; }

/** Clamp ASR cues to the edited reel, merge overlapping speech, preserve its order. */
export function normalizeReelCues(cues: DubCue[], duration: number): DubCue[] {
  const sorted = cues.filter(c => c.text.trim() && Number.isFinite(c.start) && Number.isFinite(c.end))
    .map(c => ({ start: Math.max(0, c.start), end: Math.min(duration, c.end), text: c.text.trim() }))
    .filter(c => c.end > c.start).sort((a, b) => a.start - b.start);
  const result: DubCue[] = [];
  for (const cue of sorted) {
    const previous = result[result.length - 1];
    if (previous && (cue.start < previous.end || (previous.end - previous.start < 1.5 && cue.start - previous.end < 0.4))) {
      previous.end = Math.max(previous.end, cue.end);
      previous.text += ` ${cue.text}`;
    } else result.push({ ...cue });
  }
  return result;
}

/** Transcribe the actual edit, rather than trimming a full-length synthesized take. */
export async function createReelDub(params: {
  reelPath: string; workDir: string; duration: number;
  audioLanguage: ChatterboxLanguage; voiceId: VoiceId; onHeartbeat?: (pid: number) => void;
}) {
  const { reelPath, workDir, duration, audioLanguage, voiceId, onHeartbeat } = params;
  const sourcePath = join(workDir, "reel-speech.wav");
  await extractAudioReferenceWav({ input: reelPath, output: sourcePath, duration, sampleRate: 16000 });
  const transcription = await runWhisper(await readFile(sourcePath), "edited-reel.wav");
  const sourceCues = normalizeReelCues(transcription.segments, duration);
  if (!sourceCues.length) throw new Error("No speech found in this highlight reel; cannot create the selected dub");
  // Use Qwen's strict validator: never silently substitute untranslated English.
  const translated = await translateSegmentTexts(sourceCues.map(c => c.text), EXPORT_AUDIO_LABELS[audioLanguage]);
  const cues = sourceCues.map((c, i) => ({ ...c, text: translated[i] }));
  const clips: Array<{ path: string; start: number; end: number; duration: number }> = [];
  for (const [i, cue] of cues.entries()) {
    const chunks: Buffer[] = [];
    for (const text of splitTtsText(cue.text, 3)) chunks.push(await synthesizeChatterbox(text, audioLanguage, voiceId));
    const path = join(workDir, `dub-${i}.wav`);
    await writeFile(path, concatWav(chunks));
    clips.push({ path, start: cue.start, end: cue.end, duration: await probeDurationSeconds(path) });
  }
  const audioPath = join(workDir, "selected-voice.wav");
  await fitDubTrack({ clips, duration, output: audioPath, onHeartbeat });
  return { audioPath, cues, sourceCues, timing: clips.map(c => ({ start: c.start, end: c.end, tempo: c.duration / (c.end - c.start) })) };
}
