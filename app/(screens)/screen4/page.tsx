"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import styles from "./transcription.module.css";

interface TranscriptSegment {
  start: number;
  end: number;
  startTime?: number;
  endTime?: number;
  text: string;
}

interface AudioFileItem {
  filename: string;
  url: string;
}

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const POLL_MS = 3000;
// Give each 10-word chunk a comfortable reading pace (~200 words per minute).
const CHUNK_DISPLAY_SECONDS = 3;
const WORDS_PER_CHUNK = 10;
const MIN_TRAILING_WORDS = 3;
const WAVEFORM_FFT_SIZE = 1024;

/**
 * Play the broadcast through the same-origin proxy rather than the presigned
 * MinIO redirect. A cross-origin media element taints the Web Audio graph, and
 * a tainted graph feeds the analyser nothing but zeroes — the waveform would
 * animate without ever tracking the voice. `selectedUrl` stays the canonical
 * identity used for transcript lookups; only playback is rewritten.
 */
const toAnalysableAudioUrl = (url: string) =>
  url.startsWith("/api/asset/") ? url.replace("/api/asset/", "/api/asset-stream/") : url;

const getSegmentStart = (segment: TranscriptSegment) =>
  segment.startTime ?? segment.start;

const getSegmentEnd = (segment: TranscriptSegment) =>
  segment.endTime ?? segment.end;

function createTeleprompterChunks(transcript: TranscriptSegment[]) {
  const chunks: TranscriptSegment[] = [];

  transcript.forEach((segment) => {
    const words = segment.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;

    const segmentStart = getSegmentStart(segment);
    const segmentEnd = getSegmentEnd(segment);
    const hasUsableTiming =
      Number.isFinite(segmentStart) && Number.isFinite(segmentEnd) && segmentEnd > segmentStart;

    if (words.length <= WORDS_PER_CHUNK) {
      chunks.push({
        text: segment.text,
        start: hasUsableTiming ? segmentStart : chunks.length * CHUNK_DISPLAY_SECONDS,
        end: hasUsableTiming ? segmentEnd : (chunks.length + 1) * CHUNK_DISPLAY_SECONDS,
      });
      return;
    }

    const segmentDuration = hasUsableTiming
      ? segmentEnd - segmentStart
      : Math.ceil(words.length / WORDS_PER_CHUNK) * CHUNK_DISPLAY_SECONDS;

    for (let wordIndex = 0; wordIndex < words.length; wordIndex += WORDS_PER_CHUNK) {
      const remainingWords = words.length - wordIndex;
      const isTinyTrailingChunk = wordIndex > 0 && remainingWords < MIN_TRAILING_WORDS;
      if (isTinyTrailingChunk) {
        const previousChunk = chunks[chunks.length - 1];
        if (previousChunk) {
          previousChunk.text = `${previousChunk.text} ${words.slice(wordIndex).join(" ")}`;
          previousChunk.end = hasUsableTiming ? segmentEnd : previousChunk.end + CHUNK_DISPLAY_SECONDS;
        }
        break;
      }

      const localChunkIndex = Math.floor(wordIndex / WORDS_PER_CHUNK);
      const chunkCount = Math.ceil(words.length / WORDS_PER_CHUNK);
      const chunkStart = hasUsableTiming
        ? segmentStart + (segmentDuration * wordIndex) / words.length
        : chunks.length * CHUNK_DISPLAY_SECONDS;
      const chunkEnd = hasUsableTiming
        ? segmentStart + (segmentDuration * Math.min(wordIndex + WORDS_PER_CHUNK, words.length)) / words.length
        : chunkStart + CHUNK_DISPLAY_SECONDS;
      const text = words.slice(wordIndex, wordIndex + WORDS_PER_CHUNK).join(" ");
      chunks.push({
        start: chunkStart,
        end: localChunkIndex === chunkCount - 1 && hasUsableTiming ? segmentEnd : chunkEnd,
        text,
      });
    }
  });

  return chunks;
}

function getActiveChunkIndex(chunks: TranscriptSegment[], currentTime: number) {
  if (!chunks.length) return -1;

  const matchingIndex = chunks.findIndex(
    (chunk) => currentTime >= getSegmentStart(chunk) && currentTime < getSegmentEnd(chunk)
  );
  if (matchingIndex >= 0) return matchingIndex;

  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    if (currentTime >= getSegmentStart(chunks[index])) {
      return index;
    }
  }

  return -1;
}

function Screen4Waveform({
  audioRef,
  isPlaying,
  sourceUrl,
}: {
  audioRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  sourceUrl: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [audioContextVersion, setAudioContextVersion] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const levelRef = useRef(0);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const resume = () => { void audioContextRef.current?.resume().catch(() => {}); };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, []);

  const stopAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const measureCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      sizeRef.current = null;
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!rect.width || !rect.height || !context) {
      sizeRef.current = null;
      return null;
    }

    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Draw in CSS pixels; the transform handles the ratio. Context state
    // survives between frames, so this only needs setting when the size does.
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    sizeRef.current = { width: rect.width, height: rect.height };
    return sizeRef.current;
  }, []);

  const paint = useCallback(
    (energy: number) => {
      const size = sizeRef.current ?? measureCanvas();
      const context = canvasRef.current?.getContext("2d");
      if (!size || !context) return;

      const { width, height } = size;
      context.clearRect(0, 0, width, height);

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const time = reducedMotion ? 0 : audioRef.current?.currentTime ?? 0;
      const center = height * 0.5;
      const amplitude = reducedMotion ? 0 : height * 0.48 * energy;
      canvasRef.current?.closest("main")?.style.setProperty("--level", reducedMotion ? "0" : energy.toFixed(3));
      const smooth = (a: number, b: number, x: number) => {
        const value = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return value * value * (3 - 2 * value);
      };
      const layers = [
        { f1: 2.2, f2: 3.7, s1: 0.9, s2: 0.6, p: 0, a: 1, colors: ["#3B82F6", "#22D3EE", "#A855F7", "#FF4FD8", "#22D3EE", "#3B82F6"] },
        { f1: 2.8, f2: 1.9, s1: 0.7, s2: 1.1, p: 1.9, a: 0.78, colors: ["#22D3EE", "#FF4FD8", "#6366F1", "#22D3EE", "#FF4FD8", "#22D3EE"] },
        { f1: 1.6, f2: 4.3, s1: 1.2, s2: 0.5, p: 3.6, a: 0.62, colors: ["#A855F7", "#3B82F6", "#FF4FD8", "#3B82F6", "#22D3EE", "#A855F7"] },
      ];
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = "rgba(170,195,255,.6)";
      context.lineWidth = 1.2;
      context.shadowColor = "#8d99ff";
      context.shadowBlur = 10;
      context.beginPath(); context.moveTo(0, center); context.lineTo(width, center); context.stroke();
      context.globalCompositeOperation = "lighter";
      for (const [index, layer] of layers.entries()) {
        const gradient = context.createLinearGradient(width * 0.08, 0, width * 0.92, 0);
        layer.colors.forEach((color, stop) => gradient.addColorStop(stop / (layer.colors.length - 1), color));
        const points: [number, number][] = [];
        const steps = 240;
        for (let point = 0; point <= steps; point++) {
          const u = point / steps;
          const envelope = smooth(0.06, 0.32, u) * (1 - smooth(0.66, 0.9, u));
          const bumps = 0.55 + 0.45 * Math.sin(u * 5.1 + time * 0.35 + layer.p) * Math.sin(u * 2.3 - time * 0.22);
          const wave = Math.sin(u * layer.f1 * Math.PI * 2 + time * layer.s1 + layer.p) * 0.62 + Math.sin(u * layer.f2 * Math.PI * 2 - time * layer.s2 + layer.p * 1.7) * 0.38;
          points.push([u * width, center - amplitude * layer.a * envelope * bumps * wave]);
        }
        context.beginPath();
        points.forEach(([x, y], point) => point ? context.lineTo(x, y) : context.moveTo(x, y));
        for (let point = points.length - 1; point >= 0; point--) {
          const [x, y] = points[point]; context.lineTo(x, center + (y - center) * 0.12);
        }
        context.closePath();
        context.globalAlpha = 0.62; context.shadowColor = layer.colors[3]; context.shadowBlur = 28;
        context.fillStyle = gradient; context.fill();
        context.globalAlpha = 0.95; context.shadowBlur = 8;
        context.beginPath();
        points.forEach(([x, y], point) => point ? context.lineTo(x, y) : context.moveTo(x, y));
        context.strokeStyle = gradient; context.lineWidth = index === 0 ? 2.2 : 1.4; context.stroke();
      }
      context.globalAlpha = 1; context.shadowBlur = 0; context.globalCompositeOperation = "source-over";
    },
    [audioRef, measureCanvas]
  );

  const drawIdleWave = useCallback(() => {
    levelRef.current = 0;
    paint(0);
  }, [paint]);

  useEffect(() => {
    measureCanvas();
    drawIdleWave();
  }, [drawIdleWave, measureCanvas, sourceUrl]);

  useEffect(() => {
    const onResize = () => {
      measureCanvas();
      paint(levelRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureCanvas, paint]);

  useEffect(() => {
    if (!isPlaying) {
      stopAnimation();
      drawIdleWave();
      return;
    }

    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    const audioWindow = window as AudioContextWindow;
    const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const audioContext = audioContextRef.current;
    // Do not route media through a suspended graph: that can stall even muted autoplay.
    if (audioContext.state !== "running") {
      void audioContext.resume().then(() => {
        if (audioContext.state === "running") setAudioContextVersion(value => value + 1);
      }).catch(() => {});
      return;
    }
    // createMediaElementSource may only be called once per element, and the
    // element outlives every source swap, so the graph is built once.
    if (!sourceRef.current) {
      sourceRef.current = audioContext.createMediaElementSource(audio);
      analyserRef.current = audioContext.createAnalyser();
      analyserRef.current.fftSize = WAVEFORM_FFT_SIZE;
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContext.destination);
    }

    void audioContext.resume();

    const analyser = analyserRef.current;
    if (!analyser) return;

    const samples = new Float32Array(analyser.fftSize);
    const render = (now: number) => {
      const elapsed = Math.min(100, now - (lastFrameRef.current ?? now));
      lastFrameRef.current = now;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      const target = audio.muted || audio.paused || audio.seeking ? 0 : Math.min(1, Math.max(0, rms - 0.002) * 5);
      const level = levelRef.current;
      levelRef.current = level + (target - level) * (1 - Math.exp(-elapsed / (target > level ? 25 : 90)));
      paint(levelRef.current < 0.002 ? 0 : levelRef.current);
      animationRef.current = window.requestAnimationFrame(render);
    };

    lastFrameRef.current = null;
    render(performance.now());

    return stopAnimation;
  }, [audioContextVersion, audioRef, drawIdleWave, isPlaying, paint, stopAnimation]);

  useEffect(() => {
    return () => {
      stopAnimation();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [stopAnimation]);

  return (
    <div className={styles.wave} aria-hidden="true">
      <canvas ref={canvasRef} width={1600} height={119} className="h-full w-full" />
    </div>
  );
}


export default function Screen4Page() {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isLoadingScript, setIsLoadingScript] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLVideoElement | null>(null);
  const teleprompterChunks = useMemo(() => createTeleprompterChunks(segments), [segments]);
  const playbackUrl = useMemo(
    () => (selectedUrl ? toAnalysableAudioUrl(selectedUrl) : null),
    [selectedUrl]
  );

  // Sample the media clock, rather than running an independent typing timer.
  // Pauses, buffering, seeking and looping therefore cannot accumulate drift.
  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let lastSample = 0;
    const sample = (now: number) => {
      if (now - lastSample >= 40) {
        setCurrentTime(audioRef.current?.currentTime ?? 0);
        lastSample = now;
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  // Use the latest recording only as the source key for its transcript.
  useEffect(() => {
    let cancelled = false;

    const fetchLatestScriptSource = async () => {
      try {
        const res = await fetch("/api/save-audio");
        if (!res.ok) return;
        const data = await res.json();
        const latest = (data.audioFiles as AudioFileItem[] | undefined)?.find(
          (file) => file.filename !== "master-audio-16k.wav"
        );
        if (!cancelled) {
          setSelectedUrl((currentUrl) => (currentUrl === latest?.url ? currentUrl : latest?.url ?? null));
        }
      } catch {
        // Keep the last successful script source while the next poll retries.
      } finally {
        if (!cancelled) setIsLoadingScript(false);
      }
    };

    fetchLatestScriptSource();
    const timer = setInterval(fetchLatestScriptSource, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // The transcription worker can finish after the source upload, so retry this
  // endpoint until the newest recording's English transcript is available.
  useEffect(() => {
    if (!selectedUrl) {
      return;
    }

    let cancelled = false;
    const fetchTranscript = async () => {
      try {
        const res = await fetch(
          `/api/transcript/english?sourceAudio=${encodeURIComponent(selectedUrl)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.exists && Array.isArray(data.transcript?.segments)) {
          setSegments((currentSegments) => {
            const nextSegments = data.transcript.segments as TranscriptSegment[];
            return JSON.stringify(currentSegments) === JSON.stringify(nextSegments)
              ? currentSegments
              : nextSegments;
          });
        }
      } catch {
        // The next poll will retry while transcription is in progress.
      }
    };

    const resetTimer = window.setTimeout(() => setSegments([]), 0);
    fetchTranscript();
    const timer = setInterval(fetchTranscript, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
      clearInterval(timer);
    };
  }, [selectedUrl]);

  useEffect(() => {
    // Audio playback must not depend on transcription finishing. A new master
    // take is immediately useful on Screen 4, while its transcript can still
    // be queued or processing in the background.
    if (!selectedUrl) return;

    const audio = audioRef.current;
    if (!audio) return;

    let disposed = false;
    audio.loop = true;
    audio.load();
    const beginPlayback = async () => {
      try { await audio.play(); }
      catch {
        // Browsers can block audible autoplay. Keep captions looping silently
        // until the viewer's next interaction permits sound.
        if (disposed) return;
        audio.muted = true;
        await audio.play().catch(() => {});
      }
      if (disposed) audio.pause();
    };
    const enableSound = () => {
      if (disposed) return;
      audio.muted = false;
      void beginPlayback();
    };
    void beginPlayback();
    window.addEventListener("pointerdown", enableSound);
    window.addEventListener("keydown", enableSound);
    return () => {
      disposed = true;
      window.removeEventListener("pointerdown", enableSound);
      window.removeEventListener("keydown", enableSound);
      audio.pause();
    };
  }, [selectedUrl]);

  const index = getActiveChunkIndex(teleprompterChunks, currentTime);
  const segment = teleprompterChunks[index];
  const words = segment?.text.trim().split(/\s+/).filter(Boolean) ?? [];
  // The transcript API supplies segment timing only. Reserve the complete
  // sentence layout and reveal words at evenly spaced points in that segment.
  const progress = segment
    ? Math.max(0, Math.min(1, (currentTime - segment.start) / (segment.end - segment.start)))
    : 0;
  const visibleWords = segment ? Math.min(words.length, Math.floor(progress * words.length) + 1) : 0;
  const seconds = Math.floor(currentTime);
  const clock = [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, "0")).join(":");

  return (
    <main className={styles.stage} data-playing={isPlaying}>
      <div className={styles.texture} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <svg className={styles.rings} aria-hidden="true" viewBox="-640 -640 1280 1280">
        <g className={styles.ringPulse}>
          {[170, 300, 450, 620].map(radius => <circle key={radius} r={radius} />)}
          <g className={styles.ringDash}><circle r="380" strokeDasharray="2 10" /></g>
          <g className={styles.ringTicks}>
            {Array.from({length: 33}, (_, i) => <path key={i} d="M0 -306v12" transform={`rotate(${(i - 16) * 5})`} />)}
          </g>
        </g>
      </svg>
      {(
        <video playsInline className="hidden" aria-hidden="true"
          ref={audioRef}
          src={playbackUrl ?? undefined}
          preload="auto"
          autoPlay
          loop
          onLoadedMetadata={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlaying={() => setIsPlaying(true)}
          onWaiting={() => setIsPlaying(false)}
          onEmptied={() => { setIsPlaying(false); setCurrentTime(0); }}
          onPause={() => setIsPlaying(false)}
        />
      )}

      <header className={styles.header}>
        <span className={styles.identity}><i />Audio to text</span>
        <div className={styles.status}>
          <span><i />{clock}</span>
          <span>English · {segments.length ? "Transcribed" : "Preparing"}</span>
          <span>{isPlaying ? "Playing" : "Standby"}</span>
        </div>
      </header>
      <section className={styles.captions}>
        <span className={styles.speaker}><b aria-hidden="true"><i /><i /><i /></b>Master audio</span>
        <p className={styles.previous} key={`previous-${index}`} aria-hidden="true">{teleprompterChunks[index - 1]?.text}</p>
        <p className={styles.caption} key={`${selectedUrl}-${index}`} aria-hidden="true">
          {segment ? words.map((word, wordIndex) => (
            <React.Fragment key={wordIndex}>
              {wordIndex > 0 ? " " : null}
              <span className={styles.word} data-visible={wordIndex < visibleWords}
                data-current={wordIndex === visibleWords - 1 && currentTime < segment.end}>{word}</span>
            </React.Fragment>
          )) : (!selectedUrl && !isLoadingScript ? "Waiting for the next broadcast" : segments.length ? "Waiting for speech…" : "Preparing transcript…")}
        </p>
        <p className={styles.accessibleCaption} role="status" aria-live="polite" aria-atomic="true">
          {segment?.text ?? (!selectedUrl && !isLoadingScript ? "Waiting for the next broadcast" : segments.length ? "Waiting for speech…" : "Preparing transcript…")}
        </p>
      </section>
      <Screen4Waveform audioRef={audioRef} isPlaying={isPlaying} sourceUrl={playbackUrl} />
    </main>
  );
}
