import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jb-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinOS AI — Your AI Personal CFO",
  description:
    "FinOS AI · Your Personal AI CFO. 建立你的财富分身，连接你的模型，让 AI 长期陪伴你的财富成长。",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${jbMono.variable} font-sans antialiased`}>
        <Providers>
          <div className="mesh-bg" />
          <div className="grid-dots" />
          {children}
        </Providers>
      </body>
    </html>
  );
}
