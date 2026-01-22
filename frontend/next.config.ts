import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allow all for prototype (or restrict to s3/placehold.co)
      },
    ],
  },
};

export default nextConfig;
