import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      {
        protocol: "https",
        hostname: "jp-op-photos.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "www.cardrush-op.jp",
      },
    ],
  },
};

export default nextConfig;
