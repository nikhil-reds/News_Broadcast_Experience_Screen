import RecordingLooper from "@/components/recording-looper";

/**
 * Mobile-sized (390x844, standard phone portrait) loop of the newest
 * Gemini-cut highlight reel, centered on the page — a device preview, not a
 * full-screen kiosk display like Screens 01-03/06/12. No controls, no text.
 */
export default function Screen11Page() {
  return <RecordingLooper source={{ highlight: true }} frame={{ width: 390, height: 844 }} />;
}
