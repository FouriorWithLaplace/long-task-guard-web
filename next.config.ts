import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // 大体积 ZIP 下载可能持续数分钟，开发代理需要允许长时间流式传输。
    proxyTimeout: 30 * 60 * 1000,
  },
  serverExternalPackages: ["node-pty", "@xterm/headless", "@xterm/addon-serialize", "ws"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
