"use client";

const BACKGROUND_VIDEO_SRC = "/bg-video/1.1.mp4";

export default function BackgroundVideoScreen() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <video
        src={BACKGROUND_VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
        className="h-full w-full object-cover"
      />
    </main>
  );
}
