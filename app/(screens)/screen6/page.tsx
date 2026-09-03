import RecordingLooper from "@/components/recording-looper";

/** Loops the newest Gemini-cut highlight reel with embedded synchronized audio. */
export default function Screen6Page() {
  return (
    <RecordingLooper
      source={{ highlight: true }}
      muted={false}
      screenId={6}
      englishSubtitles
    />
  );
}
