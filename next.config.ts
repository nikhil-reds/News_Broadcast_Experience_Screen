import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `serialport` ships native bindings, so it has to be require()d at runtime
  // instead of bundled into the server build.
  serverExternalPackages: ["serialport"],
};

export default nextConfig;
