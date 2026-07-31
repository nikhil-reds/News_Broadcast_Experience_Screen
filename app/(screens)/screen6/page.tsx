import RecordingLooper from "@/components/recording-looper";

/** Loops the newest Gemini-cut highlight reel built from both camera takes. */
export default function Screen6Page() {
  return <RecordingLooper source={{ highlight: true }} />;
}
