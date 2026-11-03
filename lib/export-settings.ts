export const EXPORT_AUDIO_LABELS = { en: "English", hi: "Hindi", de: "German", fr: "French", es: "Spanish" } as const;
export type ExportAudioLanguage = keyof typeof EXPORT_AUDIO_LABELS;
export const EXPORT_DUB_VERSION = "reel-dub-v1";
export function isExportAudioLanguage(value: unknown): value is ExportAudioLanguage {
  return typeof value === "string" && Object.hasOwn(EXPORT_AUDIO_LABELS, value);
}
