import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.29.239"],
  // `serialport` ships native bindings, so it has to be require()d at runtime
  // instead of bundled into the server build.
  serverExternalPackages: ["serialport"],
};

export default nextConfig;
