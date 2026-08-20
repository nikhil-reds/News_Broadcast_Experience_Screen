import RecordingLooper from "@/components/recording-looper";

/** Loops the newest Gemini-cut highlight reel, with its audio audible. */
export default function Screen6Page() {
  return <RecordingLooper source={{ highlight: true }} muted={false} screenId={6} />;
}
