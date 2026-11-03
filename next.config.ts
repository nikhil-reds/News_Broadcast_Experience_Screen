import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permit the current hotspot/LAN address during local device testing.
  // Without it Next.js rejects the phone's /_next/webpack-hmr WebSocket with
  // HTTP 403 even though the page itself has loaded successfully.
  allowedDevOrigins: ["192.168.29.239", "10.190.55.126"],
};

export default nextConfig;
