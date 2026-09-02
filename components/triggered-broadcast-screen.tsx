"use client";

import type { ReactNode } from "react";
import BackgroundVideoScreen from "@/components/background-video-screen";
import { useBroadcastTrigger } from "@/lib/use-broadcast-trigger";

export default function TriggeredBroadcastScreen({ children }: { children: ReactNode }) {
  const { isFinalActive } = useBroadcastTrigger();

  if (isFinalActive) {
    return <>{children}</>;
  }

  return <BackgroundVideoScreen />;
}
