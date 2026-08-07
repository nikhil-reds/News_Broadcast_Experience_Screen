import RecordingLooper from "@/components/recording-looper";

/** Full-bleed loop of the newest Gemini-cut highlight reel — no controls, no text. */
export default function Screen12Page() {
  return <RecordingLooper source={{ highlight: true }} />;
}
