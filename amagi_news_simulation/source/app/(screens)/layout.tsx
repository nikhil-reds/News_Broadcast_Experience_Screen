import type { ReactNode } from "react";
import TriggeredBroadcastScreen from "@/components/triggered-broadcast-screen";

export default function ScreensLayout({ children }: { children: ReactNode }) {
  return <TriggeredBroadcastScreen>{children}</TriggeredBroadcastScreen>;
}
