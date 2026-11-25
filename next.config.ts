import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `lib/green-screen.ts` is shared by server routes and client screens. Next
  // only exposes explicitly bundled values to browser code, so without this
  // the client silently falls back to rvm-v1 while workers and APIs use the
  // current server-side version (for example rvm-v2). Keep one source of
  // truth and bake the harmless cache-version string into both bundles.
  env: {
    GREEN_SCREEN_MATTING_VERSION:
      process.env.GREEN_SCREEN_MATTING_VERSION || "rvm-v1",
  },
  // Permit the current hotspot/LAN address during local device testing.
  // Without it Next.js rejects the phone's /_next/webpack-hmr WebSocket with
  // HTTP 403 even though the page itself has loaded successfully.
  allowedDevOrigins: ["192.168.29.239", "10.190.55.126"],
};

export default nextConfig;
