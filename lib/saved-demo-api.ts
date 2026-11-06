import { NextRequest, NextResponse } from "next/server";
import { getDemoPlayback, savedDemoPackage, updateDemoPlayback } from "@/lib/demo-control";
import { activeScreens, workflowRun } from "@/lib/screen-workflow";
import { redisConnection } from "@/lib/redis";
import { saveSelectionState } from "@/lib/selection-state";
import { getAudioLanguageState, saveAudioLanguageState, isAudioLanguageCode } from "@/lib/audio-language-state";
import { getBrightnessState, saveBrightnessState, isBrightness } from "@/lib/brightness-state";
import { VOICE_PROFILES, isVoiceId } from "@/lib/voice-profiles";
import { realtimeSelections } from "@/lib/realtime-selections";
import type { SavedDemoPackage } from "@/lib/saved-demo-types";

const labels: Record<string, string> = { en: "English", de: "German", hi: "Hindi", fr: "French", es: "Spanish", off: "Off" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
const unavailable = () => json({ error: "This option was not saved in the demo. Choose a saved option; no processing will be started.", status: "failed" }, 409);
function catalogue(snapshot: SavedDemoPackage, voiceId: string) {
  return { exists: true, voiceId, voices: VOICE_PROFILES.filter(voice => snapshot.translations.some(audio => audio.voiceId === voice.id)), languages: Object.entries(labels).filter(([code]) => code !== "off").map(([langCode, language]) => {
    const original = langCode === "en";
    const audio = snapshot.translations.find(item => item.language === language && item.voiceId === voiceId);
    const url = original ? snapshot.audioFiles[0].url : audio?.url ?? null;
    return { language, langCode, voiceId, url, ready: Boolean(url), translated: Boolean(snapshot.transcripts[language]), original, status: url ? "ready" : "not-saved", error: url ? null : "This voice was not saved in the demo." };
  }) };
}

/** Handles every screen data/processing request in demo mode. No queue or worker imports. */
export async function savedDemoResponse(request: NextRequest): Promise<Response | null> {
  const path = request.nextUrl.pathname;
  const query = request.nextUrl.searchParams;
  // New recordings use the normal path, which ends Demo before selecting the new live take.
  if (path === "/api/sessions") return null;
  const playback = await getDemoPlayback();
  const body = !["GET", "HEAD"].includes(request.method) && request.headers.get("content-type")?.includes("application/json")
    ? await request.clone().json().catch(() => ({})) as Record<string, unknown> : {};
  if (!playback.active || !playback.sessionId || !playback.session || !playback.workflow) {
    // Stale requests from unmounting demo screens must not reach live write endpoints.
    if (decodeURIComponent(path).includes("demo-") || query.get("sessionId")?.startsWith("demo-") || String(body.sessionId ?? "").startsWith("demo-") ||
        [...query.values(), ...Object.values(body)].some(value => typeof value === "string" && (value.includes("/demo/snapshot/") || value.includes("-demo-")))) {
      return json({ error: "The demo has ended. Refresh the screen." }, 409);
    }
    return null;
  }
  const snapshot = await savedDemoPackage();
  const id = playback.sessionId;
  const workflow = playback.workflow;
  const method = request.method;
  const reel = snapshot.recordings.find(row => row.filename.startsWith("highlight-"))!;
  const demoFilename = (filename: string) => filename.replace(/^(highlight-|camera(?:2|3)?-recording-)/, "$1demo-");

  if (path === "/api/screen-workflow") {
    if (method === "GET") {
      if (query.get("output") === "1") return json({ serverNow: Date.now(), sessionId: id, startedAt: workflow.publishedAt ? Date.parse(workflow.publishedAt) : null });
      const screen = Number(query.get("screen"));
      const active = activeScreens(workflow.applied);
      return json({ state: workflow, active, ready: active.includes(screen), readyDisplays: playback.readyDisplays });
    }
    if (method === "DELETE") return json({ error: "End Demo and start it again to restart the saved flow." }, 409);
    const screen = Number(body.screen);
    if (body.sessionId !== id || !Number.isInteger(screen) || screen < 1 || screen > 12) return json({ error: "Demo session changed" }, 409);
    if (method === "PUT") {
      await updateDemoPlayback(id, state => {
        if (!state.workflow || body.run !== workflowRun(state.workflow) || !activeScreens(state.workflow.applied).includes(screen)) throw new Error("This display is no longer active.");
        if (!state.readyDisplays.includes(screen)) state.readyDisplays.push(screen);
      });
      return json({ ready: true });
    }
    if (method === "POST") {
      const updated = await updateDemoPlayback(id, state => {
        const flow = state.workflow!;
        if (flow.applied.includes(screen)) return;
        if (!activeScreens(flow.applied).includes(screen)) throw new Error("This screen is not active yet.");
        flow.applied.push(screen); flow.applied.sort((a, b) => a - b); flow.revision++;
        if (screen === 11) flow.broadcastAt = Date.now();
        if (screen === 12) flow.publishedAt = new Date().toISOString();
      });
      return json({ state: updated.workflow, active: activeScreens(updated.workflow!.applied), ready: false });
    }
  }
  if (path === "/api/sessions/current" || path.startsWith("/api/sessions/")) {
    if (method === "PATCH") {
      if (path !== `/api/sessions/${id}`) return json({ error: "Demo session changed" }, 409);
      const updated = await updateDemoPlayback(id, state => {
        const session = state.session!;
        if (typeof body.selectedBackgroundId === "string" && snapshot.composites[body.selectedBackgroundId]) session.selectedBackgroundId = body.selectedBackgroundId;
        if (typeof body.selectedSubtitleLanguage === "string" && (snapshot.transcripts[body.selectedSubtitleLanguage] || body.selectedSubtitleLanguage === "Off")) session.selectedSubtitleLanguage = body.selectedSubtitleLanguage;
        if (typeof body.selectedAudioLanguage === "string" && Object.values(labels).includes(body.selectedAudioLanguage)) session.selectedAudioLanguage = body.selectedAudioLanguage;
        if (isBrightness(body.selectedBrightness)) session.selectedBrightness = body.selectedBrightness;
      });
      return json({ session: updated.session });
    }
    return json({ session: playback.session });
  }
  if (path === "/api/save-recording" && method === "GET") {
    const prefix = query.get("kind") === "highlight" ? "highlight-" : ({ "1": "camera-recording-", "2": "camera2-recording-", "3": "camera3-recording-" }[query.get("camera") || ""]);
    return json({ recordings: snapshot.recordings.filter(row => !prefix || row.filename.startsWith(prefix)).map(row => ({ ...row, filename: demoFilename(row.filename) })) });
  }
  if (path === "/api/save-audio" && method === "GET") return json({ audioFiles: snapshot.audioFiles });
  if (path.startsWith("/api/asset/") || path.startsWith("/api/asset-stream/")) {
    const key = decodeURIComponent(path.replace(/^\/api\/asset(?:-stream)?\//, "")).replace("highlight-demo-", "highlight-");
    const url = snapshot.assets[key];
    return url ? NextResponse.redirect(new URL(url, request.url), 307) : unavailable();
  }
  if (path === "/api/audio-language") {
    const voice = String(body.voiceId || query.get("voiceId") || snapshot.voiceId);
    if (method === "POST" && !snapshot.translations.some(audio => audio.voiceId === voice && audio.language === body.language)) return unavailable();
    return json(catalogue(snapshot, voice));
  }
  if (path === "/api/audio-language/selection") {
    if (method === "GET") return json({ state: await getAudioLanguageState(id) });
    const code = body.audioLanguage;
    const voice = body.voiceId ?? snapshot.voiceId;
    if (body.sessionId !== id || !isAudioLanguageCode(code) || !isVoiceId(voice)) return unavailable();
    if (code !== "en" && !snapshot.translations.some(audio => audio.langCode === code && audio.voiceId === voice)) return unavailable();
    await updateDemoPlayback(id, state => { state.session!.selectedAudioLanguage = labels[code]; });
    return json({ state: await saveAudioLanguageState(id, code, voice) });
  }
  if (path === "/api/brightness/selection") {
    if (method === "GET") return json({ state: await getBrightnessState(id) });
    if (body.sessionId !== id || !isBrightness(body.brightness)) return json({ error: "Invalid brightness" }, 400);
    const brightness = body.brightness;
    await updateDemoPlayback(id, state => { state.session!.selectedBrightness = brightness; });
    return json({ state: await saveBrightnessState(id, brightness) });
  }
  if (path === "/api/realtime-selections") {
    const kind = String(body.kind ?? query.get("kind"));
    if (!Object.hasOwn(realtimeSelections, kind)) return unavailable();
    if (method === "GET") return json({ state: JSON.parse(await redisConnection.get(`broadcast:session:${id}:${kind}`) || "null") });
    const value = body.value;
    const allowed: readonly string[] = realtimeSelections[kind as keyof typeof realtimeSelections].allowed;
    if (body.sessionId !== id || typeof value !== "string" || !allowed.includes(value)) return unavailable();
    if (kind === "background" && !snapshot.composites[value]) return unavailable();
    await updateDemoPlayback(id, state => {
      if (kind === "background") state.session!.selectedBackgroundId = value;
      if (kind === "subtitle-language") state.session!.selectedSubtitleLanguage = labels[value];
    });
    return json({ state: await saveSelectionState(kind, id, value) });
  }
  if (path.startsWith("/api/transcript") || path === "/api/transcribe" || path === "/api/translate") {
    const language = String(body.language || query.get("language") || path.split("/").pop() || "English");
    const label = Object.values(labels).find(name => name.toLowerCase() === language.toLowerCase()) || labels[language] || "English";
    const transcript = snapshot.transcripts[label];
    return transcript ? json({ exists: true, success: true, transcript, cached: true, sttEngine: "Saved demo" }) : unavailable();
  }
  if (path === "/api/subtitle-cues") return json({ cues: snapshot.cues[query.get("language") || "English"] || [] });
  if (path === "/api/green-screen/status") return json({
    sourceFilename: demoFilename(reel.filename), matteStatus: "MATTE_READY", allReady: true, readyCount: Object.keys(snapshot.composites).length,
    backgroundsStatus: Object.entries(snapshot.composites).map(([backgroundId, data]) => ({ backgroundId, status: data.fallback ? "fallback-ready" : "completed", progress: 100, ...data })),
  });
  if (path.startsWith("/api/green-screen/compose")) {
    const composite = snapshot.composites[String(body.backgroundId || query.get("backgroundId"))];
    return composite ? json({ ...composite, status: composite.fallback ? "fallback-ready" : "completed", cached: true }) : unavailable();
  }
  if (/^\/api\/screens\/\d+\/publication$/.test(path)) {
    const screen = Number(path.split("/")[3]);
    return json({ status: "current", generationId: id, seq: snapshot.session.seq, progress: null, failureReason: null,
      assets: { filename: demoFilename(reel.filename), videoUrl: screen >= 7 ? snapshot.composites[playback.session.selectedBackgroundId]?.url || reel.url : reel.url } });
  }
  // Unrecognised processing/upload/export actions fail closed in Demo mode.
  // In particular, a missing variant can never fall through to a worker queue.
  return unavailable();
}
