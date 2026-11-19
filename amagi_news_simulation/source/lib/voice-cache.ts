import { createHash } from "node:crypto";
import { CHATTERBOX_REVISION, SYNTHESIS_VERSION, voiceProfile, type VoiceId } from "./voice-profiles";

export function voiceCacheKey(text: string, voiceId: VoiceId) {
  return createHash("sha256").update(JSON.stringify({
    text, voiceId, reference: voiceProfile(voiceId).referenceHash,
    revision: CHATTERBOX_REVISION, settings: SYNTHESIS_VERSION,
  })).digest("hex");
}
