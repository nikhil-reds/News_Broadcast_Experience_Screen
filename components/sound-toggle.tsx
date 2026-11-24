import styles from "./sound-toggle.module.css";

export default function SoundToggle({
  enabled,
  onToggle,
  className = "",
}: {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const label = enabled ? "Turn sound off" : "Turn sound on";

  return (
    <button
      type="button"
      className={`${styles.control} ${className}`}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 9v6h4l5 4V5L9 9H5Z" />
        {enabled ? (
          <>
            <path d="M17 9.2a4 4 0 0 1 0 5.6" />
            <path d="M19.7 6.5a7.8 7.8 0 0 1 0 11" />
          </>
        ) : (
          <>
            <path d="m17 9 5 5" />
            <path d="m22 9-5 5" />
          </>
        )}
      </svg>
      <span className={styles.srOnly}>{enabled ? "Sound on" : "Sound off"}</span>
    </button>
  );
}
