"use client";

import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";

/**
 * 全局 Providers（Phase 7.0.4 #306）。
 *
 * QueryClient 用 useState 惰性创建：每次渲染返回同一实例，
 * 同时避免 SSR 阶段在服务端为每个请求重建客户端（保持 QueryClient 的单例语义）。
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
