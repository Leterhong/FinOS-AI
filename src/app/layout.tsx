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
