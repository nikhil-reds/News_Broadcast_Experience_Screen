"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./demo-player.module.css";

type Camera = { id: number; src: string; offsetMs: number; muted: boolean };
type Manifest = {
  title: string;
  durationMs: number;
  cameras: Camera[];
  audio: { src: string; offsetMs: number; volume: number; language: string };
  background: string;
  captions: string;
  timeline: string;
  initial: { camera: number; brightness: number; subtitleLanguage: string; brand: string };
};
type TimelineEvent = { at: number; type: string; camera?: number; sourceTime?: number; image?: string };
type Timeline = { durationMs: number; events: TimelineEvent[] };
type Caption = { start: number; end: number; text: string };

function timecode(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function DemoPlayer() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [needsStart, setNeedsStart] = useState(true);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRefs = useRef(new Map<number, HTMLVideoElement>());
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/demo/manifest.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject(new Error("Demo manifest is missing"))),
      fetch("/demo/timeline.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject(new Error("Demo timeline is missing"))),
      fetch("/demo/captions.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : []),
    ]).then(([nextManifest, nextTimeline, nextCaptions]) => {
      if (cancelled) return;
      setManifest(nextManifest);
      setTimeline(nextTimeline);
      setCaptions(nextCaptions);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load the demo"));
    return () => { cancelled = true; };
  }, []);

  const cameraEvents = useMemo(() => timeline?.events.filter((event) => event.type === "camera") ?? [], [timeline]);
  const cameraEvent = [...cameraEvents].reverse().find((event) => event.at <= elapsed) ?? cameraEvents[0];
  const activeCamera = cameraEvent?.camera ?? manifest?.initial.camera ?? 1;
  const adEvent = [...(timeline?.events ?? [])].reverse().find((event) => event.type === "ad" && event.at <= elapsed);
  const caption = captions.find((item) => elapsed >= item.start * 1000 && elapsed < item.end * 1000)?.text ?? "";

  const stopFrame = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  const pause = useCallback(() => {
    stopFrame();
    audioRef.current?.pause();
    videoRefs.current.forEach((video) => video.pause());
    setPlaying(false);
  }, []);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !timeline) return;
    const nextElapsed = Math.min(timeline.durationMs, audio.currentTime * 1000);
    setElapsed(nextElapsed);
    if (nextElapsed >= timeline.durationMs || audio.ended) {
      pause();
      setFinished(true);
      return;
    }
    const currentEvent = [...cameraEvents].reverse().find((event) => event.at <= nextElapsed) ?? cameraEvents[0];
    if (currentEvent?.camera) {
      const video = videoRefs.current.get(currentEvent.camera);
      const target = ((currentEvent.sourceTime ?? 0) + nextElapsed - currentEvent.at) / 1000;
      if (video) {
        if (Math.abs(video.currentTime - target) > 0.18) video.currentTime = target;
        if (video.paused) void video.play().catch(() => {});
      }
      videoRefs.current.forEach((item, id) => { if (id !== currentEvent.camera && !item.paused) item.pause(); });
    }
    frameRef.current = requestAnimationFrame(tick);
  }, [cameraEvents, pause, timeline]);

  const play = useCallback(async (fromStart = false) => {
    if (!manifest || !timeline || !audioRef.current) return;
    stopFrame();
    setError("");
    setFinished(false);
    if (fromStart || elapsed >= timeline.durationMs) {
      audioRef.current.currentTime = manifest.audio.offsetMs / 1000;
      videoRefs.current.forEach((video) => { video.currentTime = 0; video.pause(); });
      setElapsed(0);
    }
    try {
      audioRef.current.volume = manifest.audio.volume;
      await audioRef.current.play();
      setNeedsStart(false);
      setPlaying(true);
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      setNeedsStart(true);
      setError("Your browser blocked sound. Select Start demo to begin playback.");
    }
  }, [elapsed, manifest, tick, timeline]);

  useEffect(() => () => {
    stopFrame();
    audioRef.current?.pause();
    videoRefs.current.forEach((video) => video.pause());
  }, []);

  if (!manifest || !timeline) {
    return <main className={styles.shell}><div className={styles.curtain}><div className={styles.card}><h1>Saved demo</h1><p className={error ? styles.error : undefined}>{error || "Loading the broadcast package…"}</p></div></div></main>;
  }

  const adImage = adEvent?.image ? `/demo/images/${adEvent.image}` : null;
  return (
    <main className={styles.shell}>
      <div className={styles.stage} style={{ backgroundImage: `url(${manifest.background})` }}>
        <div className={styles.programme} style={{ filter: `brightness(${manifest.initial.brightness}%)` }}>
          {manifest.cameras.map((camera) => (
            <video key={camera.id} ref={(node) => { if (node) videoRefs.current.set(camera.id, node); else videoRefs.current.delete(camera.id); }}
              className={`${styles.video} ${camera.id === activeCamera ? styles.videoActive : ""} ${adImage ? styles.adVideoInset : ""}`}
              src={camera.src} muted playsInline preload="auto" />
          ))}
          {adImage ? <img className={styles.ad} src={adImage} alt={`${manifest.initial.brand} sponsored frame`} /> : null}
          <div className={styles.topbar}><div className={styles.brand}><span className={styles.live}>Demo</span><span>{manifest.title}</span></div><span className={styles.time}>{timecode(elapsed)} / {timecode(manifest.durationMs)}</span></div>
          {caption ? <p className={styles.caption}>{caption}</p> : null}
          <div className={styles.controls}>
            <button className={styles.button} type="button" onClick={() => playing ? pause() : void play()}>{playing ? "Pause" : "Play"}</button>
            <button className={styles.button} type="button" onClick={() => void play(true)}>Replay</button>
          </div>
        </div>
        <audio ref={audioRef} src={manifest.audio.src} preload="auto" />
        {(needsStart || finished) && <div className={styles.curtain}><div className={styles.card}>
          <h1>{finished ? "Broadcast complete" : "Saved broadcast demo"}</h1>
          <p className={error ? styles.error : undefined}>{error || `${manifest.audio.language} audio, ${manifest.initial.subtitleLanguage} captions, and three synchronized cameras.`}</p>
          <button className={styles.button} type="button" onClick={() => void play(true)}>{finished ? "Replay demo" : "Start demo"}</button>
        </div></div>}
      </div>
    </main>
  );
}
