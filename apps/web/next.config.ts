import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // keep the dev-only route badge out of demo recordings
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
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
