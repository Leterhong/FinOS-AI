import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Phase 7.5 #358：Docker 生产镜像使用 standalone 产物，
  // 只打包实际被引用的依赖，运行镜像体积从 ~1.2G 降到 ~200M。
  output: "standalone",
  async redirects() {
    return [
      { source: "/login", destination: "/", permanent: true },
      { source: "/register", destination: "/", permanent: true },
      { source: "/twin", destination: "/cases", permanent: true },
      { source: "/timeline", destination: "/cases", permanent: true },
      { source: "/data", destination: "/documents", permanent: true },
      { source: "/investment", destination: "/research", permanent: true },
      { source: "/investments", destination: "/research", permanent: true },
      { source: "/wealth-monitor", destination: "/risk", permanent: true },
      { source: "/wealth-lab", destination: "/research", permanent: true },
      { source: "/report", destination: "/research", permanent: true },
      { source: "/chat", destination: "/assistant", permanent: true },
      { source: "/automations", destination: "/workflows", permanent: true },
      { source: "/memory", destination: "/agents", permanent: true },
      { source: "/knowledge", destination: "/rules", permanent: true },
      { source: "/onboarding/:path*", destination: "/cases", permanent: true },
      { source: "/notifications", destination: "/risk", permanent: true },
      { source: "/privacy-center", destination: "/documents", permanent: true },
      { source: "/usage", destination: "/agents", permanent: true },
      { source: "/settings/profile", destination: "/", permanent: true },
      { source: "/settings/models", destination: "/agents", permanent: true },
      { source: "/settings/ai-usage", destination: "/agents", permanent: true },
      { source: "/settings/data-sources", destination: "/documents", permanent: true },
    ];
  },
};

export default nextConfig;
