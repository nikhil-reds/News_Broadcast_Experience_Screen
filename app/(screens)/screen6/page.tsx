import RecordingLooper from "@/components/recording-looper";

/** Loops the newest Gemini-cut highlight reel with Screen 5's original audio. */
export default function Screen6Page() {
  return <RecordingLooper source={{ highlight: true }} originalAudio screenId={6} />;
}
