import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "ffmpeg-static"],
  images: { unoptimized: true },
};

export default nextConfig;
