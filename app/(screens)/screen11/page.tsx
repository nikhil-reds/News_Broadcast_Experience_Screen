import FinalExportPlayer from "@/components/final-export-player";

/**
 * Final preview — portrait: the actual composite export (background swap +
 * burned-in subtitles + audio + ad banner overlay), not just the raw
 * highlight reel. Mobile-sized (390x844) device preview, centered on the
 * page — Screen 12 is the same export in landscape, full-bleed.
 */
export default function Screen11Page() {
  return <FinalExportPlayer aspect="portrait" frame={{ width: 390, height: 844 }} adPosition="bottom" />;
}
