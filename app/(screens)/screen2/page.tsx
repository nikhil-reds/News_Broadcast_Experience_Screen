import RecordingLooper from "@/components/recording-looper";
import styles from "@/components/brightness-preview.module.css";

export default function Screen2Page() {
  return (
    <div className={styles.stage}>
      <RecordingLooper source={{ camera: 2 }} />
      <div className={styles.badge}>
        <i aria-hidden="true" />
        Camera 2
      </div>
    </div>
  );
}
