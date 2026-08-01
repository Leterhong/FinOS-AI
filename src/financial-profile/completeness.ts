/**
 * Phase 6.7 需求十四：财富数据完整度。
 *
 * 纯函数（客户端 / 服务端共享，禁止引入 server-only）：
 * 基于财富画像 + 已导入真实数据，计算「财富数据完整度」百分比，
 * 并列出缺失维度与引导入口，帮助新用户逐步完善数据。
 */

import type { FinancialProfile } from "@/data/types";
import type { FinancialDataSummary } from "@/financial-data/types";

export interface CompletenessItem {
  key: string;
  /** 维度中文名 */
  label: string;
  /** 是否已完善 */
  filled: boolean;
  /** 缺失时的引导文案 */
  hint: string;
  /** 引导跳转入口 */
  href: string;
}

export interface WealthCompleteness {
  /** 完整度百分比 0~100 */
  percent: number;
  filled: number;
  total: number;
  /** 未完善的维度（引导用户补全） */
  missing: CompletenessItem[];
  items: CompletenessItem[];
}

/** 计算财富数据完整度 */
export function computeWealthCompleteness(
  profile: FinancialProfile | null | undefined,
  summary?: FinancialDataSummary | null
): WealthCompleteness {
  const hasAssets = Boolean(
    profile &&
      (profile.cashSavings > 0 ||
        profile.stockPortfolio > 0 ||
        profile.funds > 0 ||
        profile.realEstate > 0 ||
        profile.house > 0 ||
        profile.bonds > 0 ||
        profile.crypto > 0 ||
        profile.insurance > 0)
  );

  const items: CompletenessItem[] = [
    {
      key: "age",
      label: "年龄",
      filled: Boolean(profile && profile.age > 0),
      hint: "完善个人信息",
      href: "/onboarding/wealth",
    },
    {
      key: "occupation",
      label: "职业",
      filled: Boolean(profile && profile.occupation),
      hint: "完善个人信息",
      href: "/onboarding/wealth",
    },
    {
      key: "income",
      label: "月收入",
      filled: Boolean(profile && profile.monthlySalary > 0),
      hint: "补充收入信息",
      href: "/onboarding/wealth",
    },
    {
      key: "expense",
      label: "月支出",
      filled: Boolean(profile && profile.monthlyExpenses > 0),
      hint: "补充支出信息",
      href: "/onboarding/wealth",
    },
    {
      key: "assets",
      label: "资产情况",
      filled: hasAssets,
      hint: "上传资产证明或导入持仓",
      href: "/documents",
    },
    {
      key: "retireAge",
      label: "退休目标",
      filled: Boolean(profile && profile.goal?.retirementAge > 0),
      hint: "设定退休目标",
      href: "/onboarding/wealth",
    },
    {
      key: "target",
      label: "目标金额",
      filled: Boolean(profile && (profile.goal?.targetAmount ?? 0) > 0),
      hint: "设定财富目标",
      href: "/onboarding/wealth",
    },
    {
      key: "realdata",
      label: "真实流水 / 持仓",
      filled: Boolean(summary?.hasData),
      hint: "导入银行流水或持仓",
      href: "/data",
    },
  ];

  const filled = items.filter((i) => i.filled).length;
  const total = items.length;
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
  return {
    percent,
    filled,
    total,
    missing: items.filter((i) => !i.filled),
    items,
  };
}
