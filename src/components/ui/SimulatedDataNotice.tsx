"use client";

import Link from "next/link";
import { AlertTriangle, Database } from "lucide-react";

/**
 * 模拟数据提示（Phase 7.9 合规基线）。
 *
 * 背景：在未配置真实行情数据源时，系统的行情 / 基金 / 新闻 / 宏观数据由
 * 确定性伪随机 Provider 生成（见 src/market/providers/mock.ts）。这些数值
 * 可复现、便于演示与验收，但**不是真实市场数据**。
 *
 * 铁律：凡是把此类数据渲染给用户的界面，都必须显式标注来源，
 * 不得让用户把演示数值误认为真实行情。
 */

/** 统一文案，避免各页面口径漂移。 */
export const SIMULATED_UI_TEXT =
  "当前展示的行情数据由系统模拟生成，用于功能演示，并非真实市场行情，请勿作为投资决策依据。";

interface SimulatedDataNoticeProps {
  /** 为 false 时不渲染任何内容，便于在真实数据源接入后自动消失。 */
  simulated?: boolean;
  /** 覆盖默认文案。 */
  text?: string;
  /** compact：内联小徽章，用于卡片标题旁；banner：整条提示，用于区块顶部。 */
  variant?: "banner" | "compact";
  /** 是否展示「配置数据源」入口（仅 banner 生效）。 */
  showAction?: boolean;
  className?: string;
}

export function SimulatedDataNotice({
  simulated = true,
  text,
  variant = "banner",
  showAction = true,
  className = "",
}: SimulatedDataNoticeProps) {
  if (!simulated) return null;

  if (variant === "compact") {
    return (
      <span
        title={text ?? SIMULATED_UI_TEXT}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200 ${className}`}
      >
        <AlertTriangle className="h-3 w-3" />
        模拟数据
      </span>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 ${className}`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
      <p className="flex-1 text-xs leading-relaxed text-amber-200/90">
        {text ?? SIMULATED_UI_TEXT}
      </p>
      {showAction && (
        <Link
          href="/settings/data-sources"
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-400/10"
        >
          <Database className="h-3.5 w-3.5" />
          配置数据源
        </Link>
      )}
    </div>
  );
}

export default SimulatedDataNotice;
