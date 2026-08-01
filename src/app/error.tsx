"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * 根级错误边界（Next.js App Router）。
 * 注意：根 error.tsx 会替换整个根布局，因此必须自带 <html>/<body>。
 * 安全约束：仅向控制台记录完整错误，绝不向用户渲染堆栈或内部路径。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 仅记录到控制台，避免泄露堆栈 / 内部路径给终端用户
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          background: "#0a0e14",
          color: "#fff",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              maxWidth: 440,
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: 32,
              textAlign: "center",
              backdropFilter: "blur(12px)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "rgba(239,68,68,0.12)",
                color: "#f87171",
                marginBottom: 16,
              }}
            >
              <AlertTriangle style={{ width: 24, height: 24 }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
              页面出现了点小问题
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: "0 0 24px", lineHeight: 1.6 }}>
              我们已记录此次异常。你可以重试，或返回首页继续操作。
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#fff",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                <RotateCcw style={{ width: 16, height: 16 }} />
                重试
              </button>
              <Link
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "10px 20px",
                  borderRadius: 10,
                  background: "#00D68F",
                  color: "#04140e",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                返回首页
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
