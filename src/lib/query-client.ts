import { QueryClient } from "@tanstack/react-query";

/**
 * 创建 React Query 客户端（Phase 7.0.4 #306）。
 *
 * 默认策略：
 * - staleTime 30s：避免频繁切换页面/聚焦时重复请求；
 * - gcTime 5min：已无观察者时仍保留缓存以便快速回看；
 * - retry 2：网络抖动自动重试，但不过度；
 * - refetchOnWindowFocus false：金融数据以手动/事件驱动为主，避免焦点抢回时突兀刷新。
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}
