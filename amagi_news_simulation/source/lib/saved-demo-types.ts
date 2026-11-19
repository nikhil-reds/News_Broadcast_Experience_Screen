export type SavedMedia = { filename: string; url: string; size: number; createdAt: string };
export type SavedCue = { start: number; end: number; text: string };
export type SavedTranscript = {
  text: string; language: string; duration: number; segments: (SavedCue & { id: number })[];
  createdAt: string; sourceAudio: string;
};
export interface SavedDemoPackage {
  version: 2;
  sourceSessionId: string;
  createdAt: string;
  session: {
    id: string; seq: number; status: string; pipelineStatus: string;
    selectedBackgroundId: string; selectedSubtitleLanguage: string;
    selectedAudioLanguage: string; selectedBrightness: number;
    startedAt: string; endedAt: string | null;
  };
  recordings: SavedMedia[];
  audioFiles: SavedMedia[];
  translations: { language: string; langCode: string; voiceId: string; url: string }[];
  transcripts: Record<string, SavedTranscript>;
  cues: Record<string, SavedCue[]>;
  composites: Record<string, { url: string; fallback: string | null; fallbackReason: string | null }>;
  selections: Record<string, string>;
  voiceId: string;
  assets: Record<string, string>;
}
