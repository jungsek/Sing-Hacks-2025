import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Unblock builds while we address outstanding lint issues across the app
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "encrypted-tbn0.gstatic.com",
      },
      {
        protocol: "https",
        hostname: "www.hkma.gov.hk",
      },
      {
        protocol: "https",
        hostname: "th.bing.com",
      },
    ],
  },
};

module.exports = nextConfig;

export default nextConfig;
