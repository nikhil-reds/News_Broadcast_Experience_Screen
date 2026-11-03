import RecordingLooper from "@/components/recording-looper";
import styles from "@/components/brightness-preview.module.css";

export default function Screen3Page() {
  return (
    <div className={styles.stage}>
      <RecordingLooper source={{ camera: 3 }} />
      <div className={styles.badge}>
        <i aria-hidden="true" />
        Camera 3
      </div>
    </div>
  );
}
