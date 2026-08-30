"use client";

import { useEffect, useMemo } from "react";
import { useEnterpriseStore } from "@/store/enterprise-store";

/**
 * 全局项目上下文：所有会调用 AI 的页面共享同一个项目选择，避免企业资料串用。
 * 老版本持久化数据没有 activeCaseId 时自动回落到第一个真实项目。
 */
export function useActiveEnterpriseCase() {
  const cases = useEnterpriseStore((state) => state.cases);
  const storedId = useEnterpriseStore((state) => state.activeCaseId);
  const setActiveCaseId = useEnterpriseStore((state) => state.setActiveCaseId);
  const activeCase = useMemo(
    () => cases.find((item) => item.id === storedId) ?? cases[0] ?? null,
    [cases, storedId],
  );

  useEffect(() => {
    if (activeCase && activeCase.id !== storedId) setActiveCaseId(activeCase.id);
    if (!activeCase && storedId) setActiveCaseId("");
  }, [activeCase, setActiveCaseId, storedId]);

  return {
    cases,
    activeCase,
    activeCaseId: activeCase?.id ?? "",
    setActiveCaseId,
  };
}
