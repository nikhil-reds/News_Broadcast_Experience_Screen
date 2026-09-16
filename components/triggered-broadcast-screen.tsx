"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

export default function TriggeredBroadcastScreen({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return <ScreenStartGate key={pathname}>{children}</ScreenStartGate>;
}

function ScreenStartGate({ children }: { children: ReactNode }) {
  const [hasStarted, setHasStarted] = useState(false);

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
        onEnded={() => setHasStarted(true)}
      >
        <source src="/bg-video/1.1.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
