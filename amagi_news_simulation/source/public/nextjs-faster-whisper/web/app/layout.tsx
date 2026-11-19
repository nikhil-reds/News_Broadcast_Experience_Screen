import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Local Faster Whisper",
  description: "Local audio transcription with Next.js and faster-whisper",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
