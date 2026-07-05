import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/manga-web",
  env: {
    NEXT_PUBLIC_BASE_PATH: "/manga-web",
  },
  serverExternalPackages: ["archiver"],
};

export default nextConfig;
