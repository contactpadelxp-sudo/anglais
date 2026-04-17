import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/lingua.html",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
