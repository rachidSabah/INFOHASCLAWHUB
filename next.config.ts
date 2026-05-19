import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["@whiskeysockets/baileys", "ws", "bufferutil", "utf-8-validate"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "bufferutil", "utf-8-validate"];
    }
    return config;
  },
};

export default nextConfig;
