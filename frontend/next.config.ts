import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment
  output: "standalone",

  // LiveKit uses Node.js internals — exclude from browser bundle
  serverExternalPackages: ["livekit-server-sdk"],

  // Transpile LiveKit React components
  transpilePackages: ["@livekit/components-react", "@livekit/components-styles"],

  // Allow images from external providers
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
