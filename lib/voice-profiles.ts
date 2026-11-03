/** Shared, static IDs. Audio references are mounted locally in Chatterbox. */
export const VOICE_PROFILES = [
  { id: "indian-male-01", gender: "male", label: "Indian male", referenceHash: "6064365011d6f5910804abba0d4d0cbf51fffb42e456ce401c23b19e93a39aaa", filename: "indian-male-01.wav" },
  { id: "indian-female-01", gender: "female", label: "Indian female", referenceHash: "9c7b33b970b816982900a3b86e90590fe7834b7d07b45f5061a16e7c609efb6d", filename: "indian-female-01.wav" },
] as const;
export type VoiceId = (typeof VOICE_PROFILES)[number]["id"];
export const DEFAULT_VOICE_ID: VoiceId = "indian-male-01";
export const CHATTERBOX_REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18";
export const CHATTERBOX_CHECKPOINT = "t3_mtl23ls_v3.safetensors";
export const SYNTHESIS_VERSION = "v3-preset-1";
export function isVoiceId(value: unknown): value is VoiceId {
  return VOICE_PROFILES.some((voice) => voice.id === value);
}
export function voiceProfile(id: VoiceId) {
  return VOICE_PROFILES.find((voice) => voice.id === id)!;
}
export function voiceTaskType(langCode: string, voiceId: VoiceId) {
  return voiceId === DEFAULT_VOICE_ID ? `tts-${langCode}` : `tts-${langCode}-${voiceId}`;
}
