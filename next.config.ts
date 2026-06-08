import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home directory makes Next infer the wrong
  // workspace root; pin it to this project so local + Vercel builds agree.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
