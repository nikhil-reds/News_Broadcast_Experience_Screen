import type { Metadata } from "next";
import DemoPlayer from "@/components/demo-player";

export const metadata: Metadata = {
  title: "Saved Broadcast Demo",
  description: "Deterministic replay of the saved three-camera broadcast.",
};

export default function DemoPage() {
  return <DemoPlayer />;
}
