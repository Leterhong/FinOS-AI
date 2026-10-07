import type { NextConfig } from "next";

// 后端 FastAPI 地址：本地 dev 直连 8300，Docker 内 nginx 已代理无需 rewrite。
const BACKEND_URL = process.env.BACKEND_PROXY_URL || "http://127.0.0.1:8300";

// 页面响应安全策略。先以 Report-Only 上线，便于观察 Next.js 内联脚本/样式的违规，
// 确认无回归后再切换为强制模式（enforce）。
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 构建期限制 worker 数量，降低容器内构建内存峰值（避免被 OOM Killer 终止）。
  // optimizePackageImports 让 barrel 包按需引入，减少打包/解析体积。
  experimental: {
    cpus: 1,
    optimizePackageImports: ["lucide-react", "@radix-ui/react-dropdown-menu", "@tanstack/react-query"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Content-Security-Policy-Report-Only", value: CONTENT_SECURITY_POLICY },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // API 响应一律禁止缓存：模型配置、技能、用量等均为按会话隔离的敏感数据。
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  // Docker 生产镜像使用 standalone 产物；本地生产预览保持标准输出，
  // 这样 `npm start` 与 Next.js 的官方启动方式一致。
  output: process.env.FINOS_STANDALONE === "1" ? "standalone" : undefined,
  async rewrites() {
    return {
      // fallback rewrite：仅当请求没有匹配到任何 Next.js 路由时才代理到后端。
      // 这让本地 `npm run dev` 不依赖 nginx 即可调用 FastAPI 后端
      // （企业持久化 /api/enterprise/*、治理 /api/governance/*、
      //   认证 /api/auth/* 等全部走这里）。
      // Docker 部署下 nginx 已做同源代理，此 rewrite 是无操作。
      fallback: [
        {
          source: "/api/:path*",
          destination: `${BACKEND_URL}/api/:path*`,
        },
      ],
    };
  },
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
      { source: "/privacy-center", destination: "/documents", permanent: true },
      { source: "/usage", destination: "/agents", permanent: true },
      { source: "/settings/profile", destination: "/", permanent: true },
      { source: "/settings/models", destination: "/models", permanent: true },
      { source: "/settings/ai-usage", destination: "/agents", permanent: true },
      { source: "/settings/data-sources", destination: "/documents", permanent: true },
    ];
  },
};

export default nextConfig;
