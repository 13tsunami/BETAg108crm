// next.config.ts
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb", // выбери под себя: 10mb / 20mb / 50mb
    },
  },
};

export default config;
