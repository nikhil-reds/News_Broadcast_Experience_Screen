"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Archivo } from "next/font/google";

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
const CHUNK_TRANSITION_MS = 300;
/**
 * The incoming chunk reveals word by word rather than as one block. Ten words
 * at this stagger finish in well under a second, so the reveal is always done
 * before the next chunk is due even on fast-spoken copy.
 */
const WORD_STAGGER_MS = 26;
const TRANSCRIPT_CHUNK_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
// Leave a little air above and below a shrunk chunk instead of filling the row
// edge to edge, and never shrink type past the point of distance legibility.
const CHUNK_FIT_HEADROOM = 0.94;
const MIN_CHUNK_SCALE = 0.5;

// The rail spans the full screen, so the bar count follows its width — a fixed
// count would stretch 36 bars into slabs on a broadcast wall.
const WAVEFORM_BAR_PITCH_PX = 16;
const WAVEFORM_BAR_GAP_PX = 5;
const WAVEFORM_MIN_BARS = 24;
const WAVEFORM_MAX_BARS = 180;
const WAVEFORM_FFT_SIZE = 1024;
/**
 * Fraction of the spectrum the bars cover. Speech runs out of energy well
 * before 10kHz, so reaching too far up the spectrum leaves the right-hand bars
 * parked on the floor as a dotted line.
 */
const WAVEFORM_VOICE_BIN_RATIO = 0.22;
/**
 * Rise and fall time constants in milliseconds. An instant attack with a
 * per-frame decay multiplier reads as flicker; easing toward the incoming
 * level, and falling roughly four times slower than it rises, reads as a wave
 * settling. Expressed as time constants so the motion is identical on a 60Hz
 * and a 120Hz panel.
 */
const WAVEFORM_ATTACK_MS = 110;
const WAVEFORM_RELEASE_MS = 420;
/** Ignore frame gaps longer than this — a stalled tab should not jump the bars. */
const WAVEFORM_MAX_FRAME_MS = 100;
/** Analyser-side temporal averaging, applied before our own easing. */
const WAVEFORM_FFT_SMOOTHING = 0.86;
const WAVEFORM_FLOOR_PX = 4;

const broadcastFont = Archivo({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

// useLayoutEffect measures before paint, which is what the fit-to-row pass
// needs; fall back to useEffect during SSR so React does not warn.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
        ...segment,
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

  return 0;
}

/** Split a chunk into individually animated words, keeping normal spaces so the
 *  line still wraps between them. */
function TeleprompterWords({ text }: { text: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  return (
    <>
      {words.map((word, index) => (
        <React.Fragment key={`${index}-${word}`}>
          {index > 0 ? " " : null}
          <span
            className="screen4-word"
            style={{ animationDelay: `${index * WORD_STAGGER_MS}ms` }}
          >
            {word}
          </span>
        </React.Fragment>
      ))}
    </>
  );
}

function TeleprompterSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-5xl space-y-7 animate-pulse"
      role="status"
      aria-label="Loading teleprompter text"
    >
      <div className="h-7 w-32 mx-auto rounded-full bg-slate-800/90" />
      <div className="h-16 sm:h-24 md:h-28 w-full rounded-2xl bg-slate-800/80" />
      <div className="h-16 sm:h-24 md:h-28 w-11/12 mx-auto rounded-2xl bg-slate-800/65" />
      <div className="h-16 sm:h-24 md:h-28 w-8/12 mx-auto rounded-2xl bg-slate-800/45" />
    </div>
  );
}

function WaitingForBroadcast() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center justify-center gap-2 text-slate-400">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <p className="text-xl font-medium">Waiting for the next broadcast</p>
      </div>
      <p className="text-sm text-slate-600">
        The teleprompter will begin automatically when the script is ready.
      </p>
    </div>
  );
}

function Screen4Waveform({
  audioRef,
  isPlaying,
  sourceUrl,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  sourceUrl: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  // Per-bar level carried between frames so bars fall away from a peak instead
  // of snapping to whatever the next FFT frame happens to contain.
  const levelsRef = useRef<number[]>([]);
  // Cached CSS-pixel size and the bar count that fits it. Measuring the canvas
  // on every frame would force a layout sixty times a second for a box that
  // only changes on resize.
  const sizeRef = useRef<{ width: number; height: number; barCount: number } | null>(null);

  const stopAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  /**
   * Match the backing store to the device pixel ratio and work out how many
   * bars fit. Without the ratio the canvas renders at its CSS pixel size
   * regardless of the display, which is visibly soft on a broadcast wall.
   */
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

    const barCount = Math.min(
      WAVEFORM_MAX_BARS,
      Math.max(WAVEFORM_MIN_BARS, Math.floor(rect.width / WAVEFORM_BAR_PITCH_PX))
    );

    // Keep whatever levels survive a resize so the bars do not drop to zero.
    if (levelsRef.current.length !== barCount) {
      const next = new Array<number>(barCount).fill(0);
      for (let index = 0; index < Math.min(barCount, levelsRef.current.length); index += 1) {
        next[index] = levelsRef.current[index];
      }
      levelsRef.current = next;
    }

    sizeRef.current = { width: rect.width, height: rect.height, barCount };
    return sizeRef.current;
  }, []);

  const paint = useCallback(
    (levels: number[]) => {
      const size = sizeRef.current ?? measureCanvas();
      const context = canvasRef.current?.getContext("2d");
      if (!size || !context) return;

      const { width, height, barCount } = size;
      context.clearRect(0, 0, width, height);

      const gap = WAVEFORM_BAR_GAP_PX;
      const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#77f7ff");
      gradient.addColorStop(0.52, "#2386ff");
      gradient.addColorStop(1, "#7b2cff");

      context.shadowColor = "rgba(34, 211, 238, 0.6)";
      context.shadowBlur = 10;
      context.fillStyle = gradient;

      for (let index = 0; index < barCount; index += 1) {
        const level = Math.min(1, Math.max(0, levels[index] ?? 0));
        const barHeight = Math.max(WAVEFORM_FLOOR_PX, level * height * 0.92);
        const x = index * (barWidth + gap);
        context.fillRect(x, height - barHeight, barWidth, barHeight);
      }
    },
    [measureCanvas]
  );

  /** Resting state: a still, shallow ripple. Never mistaken for live audio. */
  const drawIdleWave = useCallback(() => {
    const size = sizeRef.current ?? measureCanvas();
    if (!size) return;

    const idle = Array.from({ length: size.barCount }, (_, index) => {
      return 0.05 + Math.abs(Math.sin(index * 0.28)) * 0.06;
    });
    levelsRef.current = idle;
    paint(idle);
  }, [measureCanvas, paint]);

  useEffect(() => {
    measureCanvas();
    drawIdleWave();
  }, [drawIdleWave, measureCanvas, sourceUrl]);

  useEffect(() => {
    const onResize = () => {
      measureCanvas();
      paint(levelsRef.current);
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
    // createMediaElementSource may only be called once per element, and the
    // element outlives every source swap, so the graph is built once.
    if (!sourceRef.current) {
      sourceRef.current = audioContext.createMediaElementSource(audio);
      analyserRef.current = audioContext.createAnalyser();
      analyserRef.current.fftSize = WAVEFORM_FFT_SIZE;
      analyserRef.current.smoothingTimeConstant = WAVEFORM_FFT_SMOOTHING;
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContext.destination);
    }

    void audioContext.resume();

    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    // Speech energy sits in the bottom slice of the spectrum. Spreading the
    // bars linearly across every bin leaves most of them permanently flat, so
    // map them over the voice range on a curve instead.
    const topBin = Math.max(4, Math.floor(analyser.frequencyBinCount * WAVEFORM_VOICE_BIN_RATIO));

    // Reused between frames so the loop allocates nothing.
    let targets: number[] = [];

    const render = (now: number) => {
      const elapsed = Math.min(WAVEFORM_MAX_FRAME_MS, now - (lastFrameRef.current ?? now));
      lastFrameRef.current = now;

      analyser.getByteFrequencyData(dataArray);
      const levels = levelsRef.current;
      const barCount = sizeRef.current?.barCount ?? levels.length;
      if (targets.length !== barCount) targets = new Array<number>(barCount).fill(0);

      for (let index = 0; index < barCount; index += 1) {
        const from = Math.floor(Math.pow(index / barCount, 1.6) * topBin);
        const to = Math.max(
          from + 1,
          Math.floor(Math.pow((index + 1) / barCount, 1.6) * topBin)
        );

        let sum = 0;
        for (let bin = from; bin < to; bin += 1) sum += dataArray[bin] ?? 0;
        targets[index] = sum / (to - from) / 255;
      }

      for (let index = 0; index < barCount; index += 1) {
        // Blend with the neighbours so the rail moves as one wave rather than
        // as a row of independently twitching sticks.
        const left = targets[Math.max(0, index - 1)];
        const right = targets[Math.min(barCount - 1, index + 1)];
        const target = (left + targets[index] * 2 + right) / 4;

        const previous = levels[index] ?? 0;
        const timeConstant = target > previous ? WAVEFORM_ATTACK_MS : WAVEFORM_RELEASE_MS;
        levels[index] = previous + (target - previous) * (1 - Math.exp(-elapsed / timeConstant));
      }

      paint(levels);
      animationRef.current = window.requestAnimationFrame(render);
    };

    lastFrameRef.current = null;
    render(performance.now());

    return stopAnimation;
  }, [audioRef, drawIdleWave, isPlaying, paint, stopAnimation]);

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
    <div className="screen4-waveform-shell" aria-hidden="true">
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
  const [needsUserStart, setNeedsUserStart] = useState(false);

  const [displayedIndex, setDisplayedIndex] = useState(-1);
  const [leavingSegment, setLeavingSegment] = useState<TranscriptSegment | null>(null);

  const transitionTimerRef = useRef<number | null>(null);
  const displayedIndexRef = useRef(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textRowRef = useRef<HTMLElement | null>(null);
  const activeChunkRef = useRef<HTMLParagraphElement | null>(null);
  const teleprompterChunks = useMemo(() => createTeleprompterChunks(segments), [segments]);
  const playbackUrl = useMemo(
    () => (selectedUrl ? toAnalysableAudioUrl(selectedUrl) : null),
    [selectedUrl]
  );

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

  const stopTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  // ---- When the newest source changes, reset the displayed script ------------
  useEffect(() => {
    if (!selectedUrl) return;
    stopTransitionTimer();
    const resetTimer = window.setTimeout(() => {
      setCurrentTime(0);
      setIsPlaying(false);
      setNeedsUserStart(false);
      setDisplayedIndex(-1);
      setLeavingSegment(null);
      displayedIndexRef.current = -1;
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [selectedUrl, stopTransitionTimer]);

  // ---- Audio playback is the single timeline for text and waveform ----------
  useEffect(() => {
    if (!teleprompterChunks.length) {
      displayedIndexRef.current = -1;
      const emptyTimer = window.setTimeout(() => {
        setDisplayedIndex(-1);
        setLeavingSegment(null);
      }, 0);
      return () => window.clearTimeout(emptyTimer);
    }

    const boundedIndex = getActiveChunkIndex(teleprompterChunks, currentTime);

    if (boundedIndex === displayedIndexRef.current) return;

    const currentIndex = displayedIndexRef.current;
    setLeavingSegment(currentIndex >= 0 ? teleprompterChunks[currentIndex] ?? null : null);
    displayedIndexRef.current = boundedIndex;
    setDisplayedIndex(boundedIndex);

    stopTransitionTimer();
    transitionTimerRef.current = window.setTimeout(() => {
      setLeavingSegment(null);
      transitionTimerRef.current = null;
    }, CHUNK_TRANSITION_MS);
  }, [currentTime, stopTransitionTimer, teleprompterChunks]);

  useEffect(() => () => stopTransitionTimer(), [stopTransitionTimer]);

  useEffect(() => {
    if (!selectedUrl || !teleprompterChunks.length) return;

    const audio = audioRef.current;
    if (!audio) return;

    audio.load();
    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => setNeedsUserStart(false))
        .catch(() => setNeedsUserStart(true));
    }
  }, [selectedUrl, teleprompterChunks.length]);

  const startBroadcast = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    void audio.play().then(() => setNeedsUserStart(false));
  }, []);

  const displayedSegment = displayedIndex >= 0 ? teleprompterChunks[displayedIndex] : null;

  // The type scale keys off viewport width, which cannot know how many lines a
  // chunk will wrap to. Measure the rendered chunk and shrink it to its own row
  // rather than let a long one grow into the audio rail.
  const fitChunkToRow = useCallback(() => {
    const row = textRowRef.current;
    const chunk = activeChunkRef.current;
    if (!row || !chunk) return;

    row.style.setProperty("--screen4-chunk-scale", "1");
    const available = row.clientHeight * CHUNK_FIT_HEADROOM;
    const needed = chunk.scrollHeight;
    if (needed > available) {
      const scale = Math.max(MIN_CHUNK_SCALE, available / needed);
      row.style.setProperty("--screen4-chunk-scale", scale.toFixed(3));
    }
  }, []);

  useIsomorphicLayoutEffect(() => {
    fitChunkToRow();
  }, [fitChunkToRow, displayedIndex, displayedSegment?.text]);

  useEffect(() => {
    window.addEventListener("resize", fitChunkToRow);
    return () => window.removeEventListener("resize", fitChunkToRow);
  }, [fitChunkToRow]);

  return (
    <div className="screen4-stage relative select-none overflow-hidden bg-slate-950 font-sans text-slate-100">
      {selectedUrl ? (
        <audio
          ref={audioRef}
          src={playbackUrl ?? undefined}
          preload="auto"
          onLoadedMetadata={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setNeedsUserStart(false);
          }}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-cyan-500/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-amber-400/10 to-transparent blur-3xl" />

      {/* Row 1 — identity rail. Reserved so the transcript never starts at the
          very top edge; the LIVE tag and logo land here in a later pass. */}
      <div aria-hidden="true" />

      {/* Row 2 — the transcript owns this row outright. Both the entering and
          leaving chunk stack in the same grid cell, so the crossfade no longer
          needs absolute positioning that escaped the padding box. */}
      <section
        ref={textRowRef}
        className="screen4-text-row relative text-center"
        aria-live="polite"
      >
        {!selectedUrl && isLoadingScript ? (
          <TeleprompterSkeleton />
        ) : !selectedUrl ? (
          <WaitingForBroadcast />
        ) : !teleprompterChunks.length ? (
          <TeleprompterSkeleton />
        ) : (
          <>
            {displayedSegment ? (
              <p
                key={`${getSegmentStart(displayedSegment)}-${displayedIndex}-in`}
                ref={activeChunkRef}
                aria-current="true"
                className={`${broadcastFont.className} screen4-chunk screen4-chunk-in text-center font-black uppercase leading-[1.03] text-white [overflow-wrap:anywhere] motion-reduce:animate-none`}
                style={{ animationTimingFunction: TRANSCRIPT_CHUNK_EASING }}
              >
                <TeleprompterWords text={displayedSegment.text} />
              </p>
            ) : null}
            {leavingSegment ? (
              <p
                key={`${getSegmentStart(leavingSegment)}-${displayedIndex}-out`}
                aria-hidden="true"
                className={`${broadcastFont.className} screen4-chunk screen4-chunk-out text-center font-black uppercase leading-[1.03] text-white [overflow-wrap:anywhere] motion-reduce:animate-none`}
                style={{ animationTimingFunction: TRANSCRIPT_CHUNK_EASING }}
              >
                {leavingSegment.text}
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* Row 3 — audio rail. Its own track, so it can never sit on the text. */}
      <div className="screen4-rail">
        {selectedUrl && teleprompterChunks.length ? (
          <>
            <Screen4Waveform audioRef={audioRef} isPlaying={isPlaying} sourceUrl={playbackUrl} />
            {needsUserStart ? (
              <button
                type="button"
                onClick={startBroadcast}
                className="rounded-md border border-cyan-300/45 bg-cyan-300/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.22)] transition hover:bg-cyan-300/18"
              >
                Start Broadcast
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <style>{`
        @keyframes screen4ChunkIn {
          from {
            opacity: 0;
            transform: translateY(28px) scale(0.97);
            filter: blur(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes screen4ChunkOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
          to {
            opacity: 0;
            transform: translateY(-34px) scale(0.97);
            filter: blur(7px);
          }
        }

        @keyframes screen4WordIn {
          from {
            opacity: 0;
            transform: translate3d(0, 0.52em, 0) scale(0.96);
            filter: blur(7px);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
            filter: blur(0);
          }
        }

        /* The words carry the entrance, so the block itself stays put — running
           both would compound the two transforms. */
        .screen4-chunk-in {
          animation: none;
        }

        /*
         * The resting state is the visible one, and the entrance uses a
         * backwards fill so a word is only hidden during its stagger delay.
         * With a both fill, an animation that never ran — a stalled compositor,
         * a browser with animations disabled — would leave the whole line at
         * opacity 0, which on an unattended broadcast wall means a blank
         * screen. This way the worst case is text that appears without motion.
         */
        .screen4-word {
          display: inline-block;
          overflow-wrap: anywhere;
          opacity: 1;
          filter: none;
          will-change: transform, opacity, filter;
          animation: screen4WordIn 360ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .screen4-word {
            animation: none;
          }
        }

        /*
         * Three fixed tracks: identity rail, transcript, audio rail. The row
         * sizes must not depend on content — an auto-sized transcript row grows
         * with a long chunk and drags the waveform up the screen with it.
         * Written here rather than as Tailwind arbitrary values because those
         * silently produced no CSS, leaving the grid on content-sized rows.
         */
        .screen4-stage {
          display: grid;
          grid-template-rows:
            var(--screen4-header-row, 12vh)
            minmax(0, 1fr)
            var(--screen4-rail-row, 22vh);
          height: 100vh;
          width: 100vw;
        }

        .screen4-text-row {
          display: grid;
          align-items: center;
          justify-items: center;
          min-height: 0;
          width: 100%;
          padding-inline: 1.5rem;
        }

        .screen4-rail {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          min-height: 0;
          padding-bottom: 2vh;
        }

        .screen4-chunk {
          grid-area: 1 / 1;
          inline-size: 100%;
          /* A wide measure keeps a ten-word chunk at three or four lines on a
             broadcast wall instead of one word per line. */
          max-inline-size: min(88vw, 1600px);
          margin-inline: auto;
          padding-inline: 1.5rem;
          /* Track the shorter viewport axis, then let the fit-to-row pass scale
             the result down when a chunk still wraps past its row. */
          font-size: calc(
            clamp(2.15rem, min(5vw, 8.5vh), 5.4rem) * var(--screen4-chunk-scale, 1)
          );
          text-shadow: 0 8px 34px rgba(0, 0, 0, 0.62), 0 0 24px rgba(125, 211, 252, 0.12);
        }

        .screen4-chunk-out {
          animation: screen4ChunkOut ${CHUNK_TRANSITION_MS}ms both;
        }

        .screen4-waveform-shell {
          /* Full-bleed audio rail. A card needs edges to read as a card, and at
             full width its only edges are the screen's — so the panel fill,
             rounding and border go, leaving the bars on a grounding glow.
             Height carries the bar length: 24px of padding plus a 95px drawing
             area gives a full-scale bar of 87px, 40% longer than the 62px it
             was at 92px tall. Capped against the viewport so the rail still
             fits its row on a short screen. */
          width: 100%;
          height: min(119px, 20vh);
          padding: 13px 0 11px;
          background: radial-gradient(
            ellipse at 50% 100%,
            rgba(37, 99, 235, 0.2),
            transparent 70%
          );
        }
      `}</style>

    </div>
  );
}
