import { createHash } from "node:crypto";
import { CHATTERBOX_REVISION, SYNTHESIS_VERSION, voiceProfile, type VoiceId } from "./voice-profiles";
import { EXPORT_DUB_VERSION, type ExportAudioLanguage } from "./export-settings";
import { QWEN_MODEL } from "./qwen";

export function exportIdentity(params: {
  reelFilename: string; reelEtag: string; sourceAudio: string; transcriptVersion: string;
  language: string; aspect: string; backgroundId: string;
  audioLanguage: ExportAudioLanguage; voiceId: VoiceId | "original";
}) {
  return createHash("sha256").update(JSON.stringify({
    ...params, version: EXPORT_DUB_VERSION, settings: SYNTHESIS_VERSION,
    model: params.voiceId === "original" ? "original" : CHATTERBOX_REVISION,
    reference: params.voiceId === "original" ? "original" : voiceProfile(params.voiceId).referenceHash,
    translation: QWEN_MODEL, stt: "local-whisper-small-reel-v1",
  })).digest("hex");
}
