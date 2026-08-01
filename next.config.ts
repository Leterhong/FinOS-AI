import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Phase 7.5 #358：Docker 生产镜像使用 standalone 产物，
  // 只打包实际被引用的依赖，运行镜像体积从 ~1.2G 降到 ~200M。
  output: "standalone",
};

export default nextConfig;
