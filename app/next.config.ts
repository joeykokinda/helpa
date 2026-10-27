import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8095";

const nextConfig: NextConfig = {
  // A second checkout of tooling (agents, CI) can build or run dev without touching the main .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  // gzip buffers the agent's live event stream; responses are small anyway.
  compress: false,
  partialPrefetching: true,
  // The app proxies /api to the Go backend so phones only need the app's own address.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
  // Agent runs stream for up to a few minutes; the proxy default (30s) would cut them off.
  experimental: { proxyTimeout: 300_000 },
};

export default nextConfig;
