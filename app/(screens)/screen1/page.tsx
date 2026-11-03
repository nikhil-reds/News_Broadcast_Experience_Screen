import RecordingLooper from "@/components/recording-looper";
import styles from "@/components/brightness-preview.module.css";

export default function Screen1Page() {
  return (
    <div className={styles.stage}>
      <RecordingLooper source={{ camera: 1 }} />
      <div className={styles.badge}>
        <i aria-hidden="true" />
        Camera 1
      </div>
    </div>
  );
}
