"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export default function TriggeredBroadcastScreen({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return <ScreenStartGate key={pathname}>{children}</ScreenStartGate>;
}

// If the intro video never starts (missing file, codec error, blocked autoplay),
// reveal the screen anyway instead of leaving the wall black.
const INTRO_START_TIMEOUT_MS = 6000;

function ScreenStartGate({ children }: { children: ReactNode }) {
  const [hasStarted, setHasStarted] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(false);

  useEffect(() => {
    if (hasStarted) return;
    const timer = window.setTimeout(() => {
      if (!introPlaying) setHasStarted(true);
    }, INTRO_START_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [hasStarted, introPlaying]);

  if (hasStarted) {
    return children;
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <video
        autoPlay
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden="true"
        onPlaying={() => setIntroPlaying(true)}
        onEnded={() => setHasStarted(true)}
        onError={() => setHasStarted(true)}
      >
        <source src="/bg-video/1.1.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
