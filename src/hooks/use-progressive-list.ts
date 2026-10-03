"use client";

import { useEffect, useState } from "react";

/**
 * 长列表渐进展示：默认只渲染前 pageSize 条，提供「加载更多」。
 * 比虚拟化实现简单、无第三方依赖，足够覆盖资料/风险等长列表。
 */
export function useProgressiveList<T>(items: T[], pageSize = 20) {
  const [count, setCount] = useState(pageSize);

  useEffect(() => {
    setCount((current) => Math.min(Math.max(current, pageSize), Math.max(items.length, pageSize)));
  }, [items.length, pageSize]);

  return {
    visible: items.slice(0, count),
    hasMore: items.length > count,
    remaining: Math.max(0, items.length - count),
    showMore: () => setCount((current) => current + pageSize),
    total: items.length,
  };
}
