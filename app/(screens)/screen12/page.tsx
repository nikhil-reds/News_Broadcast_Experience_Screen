import FinalExportPlayer from "@/components/final-export-player";

/**
 * Final preview — landscape: the same composite export as Screen 11
 * (background swap + burned-in subtitles + audio + ad banner overlay), full-
 * bleed at the broadcast/TV aspect (1920x1080) instead of Screen 11's
 * portrait device preview.
 */
export default function Screen12Page() {
  return <FinalExportPlayer aspect="landscape" adPosition="bottom" />;
}
