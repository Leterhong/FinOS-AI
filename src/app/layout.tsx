import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "FinOS AI — 企业金融风险研判 Agent",
  description: "面向企业经营与风险研判的金融服务 Agent",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* 首屏绘制前应用主题，避免深浅色闪烁（FOUC）。未手动选择时跟随系统偏好。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('finos-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}if(t==='light'){var e=document.documentElement;e.classList.remove('dark');e.classList.add('light');e.style.colorScheme='light';}}catch(e){}})();",
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <div className="mesh-bg" />
          <div className="grid-dots" />
          {children}
        </Providers>
      </body>
    </html>
  );
}
