"use client";

import { UserPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Phase 5.9 Empty Financial State（空财富状态）。
 * 当真实用户尚未创建任何财富画像时，AI CFO Chat / Digital Twin / AI Agent / Report
 * 统一展示「你好，我还不了解你的财富情况」+ [创建财富画像] 按钮。
 * 绝不展示任何占位/默认数字或 AI 伪造分析。
 * Phase 6.2：视觉统一到 <EmptyState>，保持 props 兼容。
 */
export default function NoFinancialData({
  title = "你好，我还不了解你的财富情况",
  subtitle = "创建你的财富画像后，AI CFO 才能基于你的真实数据为你分析、规划与复盘。",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <EmptyState
      title={title}
      subtitle={subtitle}
      actions={[
        {
          label: "创建财富画像",
          href: "/onboarding/wealth",
          icon: <UserPlus className="h-4 w-4" />,
        },
      ]}
    />
  );
}
