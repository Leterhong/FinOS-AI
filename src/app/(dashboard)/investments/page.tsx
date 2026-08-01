"use client";

// ── 投资中心（Phase 6.9 · #275 真实行情版）───────────────────────────────────
// 我的持仓 / 资产分布 / 收益曲线 / 风险分析 / 市场动态 / 持仓新闻。
// 数据来自用户自配数据源（Provider Adapter）：/api/finance/portfolio · market · news · analyze。
// 需求十四：绝不模拟价格 —— 无数据源 → 明确提示；源失败 → 缓存降级并标注；
// 验收测试4：无投资 → 「暂无投资数据」空态引导。

import { useEffect, useId, useMemo } from "react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import PageTransition from "@/components/dashboard/PageTransition";
import GradientText from "@/components/ui/GradientText";
import GlassCard from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import AllocationDonut from "@/components/charts/AllocationDonut";
import { useFinancialStore } from "@/store/financial-store";
import { INVESTMENT_DISCLAIMER } from "@/finance/types";
import { cn, formatCurrency } from "@/lib/utils";
import type { AssetClass } from "@/data/types";
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  ShieldAlert,
  PieChart as PieIcon,
  Activity,
  Globe2,
  AlertTriangle,
  Newspaper,
  Sparkles,
  Database,
} from "lucide-react";

/* 资产类别调色板（禁紫色：深空蓝绿金体系） */
const CLASS_COLORS = ["#0EA5E9", "#00D68F", "#F5B94A", "#38BDF8", "#2DD4BF", "#94A3B8"];

/** 涨跌颜色：红涨绿跌（中国市场惯例） */
function updownClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-white/40";
  if (v > 0) return "text-red-400";
  if (v < 0) return "text-emerald-300";
  return "text-white/60";
}

/** 百分比格式化：输入小数（0.12 → +12.00%） */
function fmtRatio(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "--";
  const p = v * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(digits)}%`;
}

/** 百分比格式化：输入已是百分数（-2.35 → -2.35%） */
function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "--";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

const DATA_STATUS_META: Record<
  string,
  { label: string; tone: "success" | "info" | "warn" | "neutral" }
> = {
  live: { label: "实时行情", tone: "success" },
  partial: { label: "部分实时", tone: "info" },
  cached: { label: "缓存行情", tone: "warn" },
  none: { label: "未连接行情", tone: "neutral" },
};

const RISK_GRADE_META: Record<string, { label: string; tone: "success" | "warn" | "error" }> = {
  low: { label: "低风险", tone: "success" },
  medium: { label: "中风险", tone: "warn" },
  high: { label: "高风险", tone: "error" },
};

const SEVERITY_TONE: Record<string, "info" | "warn" | "error"> = {
  info: "info",
  warn: "warn",
  critical: "error",
};

const TREND_LABEL: Record<string, string> = {
  up: "上行",
  down: "下行",
  sideways: "震荡",
  unknown: "未知",
};

export default function InvestmentsPage() {
  const portfolio = useFinancialStore((s) => s.portfolioView);
  const analysis = useFinancialStore((s) => s.portfolioAnalysis);
  const history = useFinancialStore((s) => s.portfolioHistory);
  const market = useFinancialStore((s) => s.marketOverview);
  const news = useFinancialStore((s) => s.financeNews);
  const newsNotice = useFinancialStore((s) => s.financeNewsNotice);
  const intelligence = useFinancialStore((s) => s.investmentIntelligence);
  const isLoading = useFinancialStore((s) => s.isLoadingPortfolio);
  const isAnalyzing = useFinancialStore((s) => s.isAnalyzingInvestment);
  const financeSources = useFinancialStore((s) => s.financeSources);
  const currentUserId = useFinancialStore((s) => s.currentUserId);
  const loadPortfolio = useFinancialStore((s) => s.loadPortfolio);
  const loadMarketOverview = useFinancialStore((s) => s.loadMarketOverview);
  const loadFinanceNews = useFinancialStore((s) => s.loadFinanceNews);
  const loadFinanceSources = useFinancialStore((s) => s.loadFinanceSources);
  const runInvestmentAnalysis = useFinancialStore((s) => s.runInvestmentAnalysis);
  const chartId = `pf-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    if (!currentUserId) return;
    void loadFinanceSources();
    void loadPortfolio();
    void loadMarketOverview();
    void loadFinanceNews();
  }, [currentUserId, loadFinanceSources, loadPortfolio, loadMarketOverview, loadFinanceNews]);

  const refresh = () => {
    void loadPortfolio();
    void loadMarketOverview();
    void loadFinanceNews();
  };

  const statusMeta = DATA_STATUS_META[portfolio?.dataStatus ?? "none"];
  const hasSources = financeSources.length > 0;

  /* 资产分布 → Donut */
  const donutData = useMemo<AssetClass[]>(
    () =>
      (portfolio?.allocation ?? []).map((s, i) => ({
        name: s.label,
        value: s.value,
        color: CLASS_COLORS[i % CLASS_COLORS.length],
      })),
    [portfolio],
  );

  /* 收益曲线（按日快照累积） */
  const seriesData = useMemo(
    () =>
      history.map((p) => ({
        date: p.date.slice(5),
        value: Math.round(p.value),
      })),
    [history],
  );

  const risk = intelligence?.risk ?? null;
  const riskMeta = risk ? RISK_GRADE_META[risk.riskGrade] : null;

  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
        {/* ── 页头 ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
              <GradientText>投资中心</GradientText>
            </h1>
            <p className="mt-1 text-sm text-white/50">
              我的持仓 · 资产分布 · 收益曲线 · 风险分析 · 市场动态
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge tone={statusMeta.tone} pulse={portfolio?.dataStatus === "live"}>
              {statusMeta.label}
              {portfolio?.sourceName ? ` · ${portfolio.sourceName}` : ""}
            </StatusBadge>
            <button
              type="button"
              onClick={refresh}
              disabled={isLoading}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              刷新行情
            </button>
          </div>
        </div>

        {/* ── 数据源 / 降级提示（验收测试 5）── */}
        {(portfolio?.dataNotice || !hasSources) && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <p className="flex-1 text-xs leading-relaxed text-amber-200/90">
              {portfolio?.dataNotice ??
                "尚未配置金融数据源。系统不默认绑定任何行情平台，配置后才会展示真实行情。"}
            </p>
            <Link
              href="/settings/data-sources"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-400/10"
            >
              <Database className="h-3.5 w-3.5" />
              配置数据源
            </Link>
          </div>
        )}

        {/* ── 市场动态（需求八：信息分析 + 风险提示，不推荐买卖）── */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
              <Globe2 className="h-4 w-4 text-brand-electric" />
              市场动态
            </div>
            {market && market.dataStatus !== "none" && (
              <StatusBadge
                tone={market.trend === "down" ? "warn" : market.trend === "up" ? "success" : "info"}
                dot={false}
              >
                趋势：{TREND_LABEL[market.trend]}
              </StatusBadge>
            )}
          </div>
          {market && market.indices.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-white/70">{market.trendNote}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {market.indices.map((idx) => (
                  <div
                    key={idx.code}
                    className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/8"
                  >
                    <p className="truncate text-xs text-white/50">{idx.name}</p>
                    <p className="mt-1 text-base font-semibold numeric">
                      {idx.value.toFixed(2)}
                    </p>
                    <p className={cn("text-xs numeric", updownClass(idx.changePct))}>
                      {fmtPct(idx.changePct)}
                    </p>
                  </div>
                ))}
              </div>
              {market.dataNotice && (
                <p className="text-[11px] text-amber-300/80">{market.dataNotice}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/40">
              {market?.dataNotice ??
                "等待连接市场数据源。连接后此处将展示真实指数行情与趋势分析，不展示任何虚假行情。"}
            </p>
          )}
        </GlassCard>

        {/* ── 主体 ── */}
        {!portfolio && isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center text-white/40">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            正在获取持仓与行情…
          </div>
        ) : !portfolio?.hasInvestments ? (
          /* 验收测试 4：无投资 → 暂无投资数据 */
          <EmptyState
            icon={<TrendingUp className="h-8 w-8 text-white" />}
            title="暂无投资数据"
            subtitle="添加股票 / 基金持仓（代码 + 数量 + 成本价）后，系统将自动获取真实行情，计算市值、收益率与风险。"
            steps={["添加持仓", "配置数据源", "获取真实行情", "组合分析", "风险提醒"]}
            actions={[
              { label: "前往金融数据中心添加持仓", href: "/data" },
              { label: "配置金融数据源", href: "/settings/data-sources" },
            ]}
            note={INVESTMENT_DISCLAIMER}
          />
        ) : (
          <>
            {/* ── 核心指标 ── */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                {
                  label: "投资组合价值",
                  value: formatCurrency(portfolio.totalValue),
                  sub: `${portfolio.positions.length} 项持仓`,
                },
                {
                  label: "累计盈亏",
                  value:
                    portfolio.totalProfit !== undefined
                      ? formatCurrency(portfolio.totalProfit)
                      : "--",
                  sub: fmtRatio(portfolio.totalReturnRate),
                  tone: updownClass(portfolio.totalProfit),
                },
                {
                  label: "今日变化",
                  value:
                    portfolio.todayChangeValue !== undefined
                      ? formatCurrency(portfolio.todayChangeValue)
                      : "--",
                  sub: fmtPct(portfolio.todayChangePct),
                  tone: updownClass(portfolio.todayChangePct),
                },
                {
                  label: "投资健康评分",
                  value: analysis ? `${analysis.healthScore}` : "--",
                  sub: analysis
                    ? { excellent: "优秀", good: "良好", fair: "一般", poor: "待改善" }[
                        analysis.scoreGrade
                      ]
                    : "待分析",
                },
              ].map((m) => (
                <GlassCard key={m.label} className="p-4">
                  <p className="text-xs text-white/45">{m.label}</p>
                  <p className={cn("mt-1.5 text-xl font-bold numeric", m.tone ?? "text-white")}>
                    {m.value}
                  </p>
                  <p className="mt-1 text-[11px] text-white/35">{m.sub}</p>
                </GlassCard>
              ))}
            </div>

            {/* ── 我的持仓表 ── */}
            <GlassCard className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                <TrendingUp className="h-4 w-4 text-brand-electric" />
                我的持仓
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-white/30">
                      <th className="pb-2 pr-3 font-medium">名称 / 代码</th>
                      <th className="pb-2 pr-3 font-medium text-right">数量</th>
                      <th className="pb-2 pr-3 font-medium text-right">成本价</th>
                      <th className="pb-2 pr-3 font-medium text-right">现价 / 净值</th>
                      <th className="pb-2 pr-3 font-medium text-right">市值</th>
                      <th className="pb-2 pr-3 font-medium text-right">今日</th>
                      <th className="pb-2 pr-3 font-medium text-right">盈亏 / 收益率</th>
                      <th className="pb-2 font-medium text-right">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.positions.map((p) => (
                      <tr
                        key={p.holdingId}
                        className="border-t border-white/5 text-white/75 hover:bg-white/[0.02]"
                      >
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-white/85">{p.name}</p>
                          <p className="text-[10px] text-white/35">
                            {p.code ?? "—"} · {p.type === "stock" ? "股票" : "基金"}
                            {p.quoteStatus === "cached" && (
                              <span className="ml-1.5 text-amber-300/80">缓存</span>
                            )}
                            {p.quoteStatus === "none" && (
                              <span className="ml-1.5 text-white/30">无行情</span>
                            )}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3 text-right numeric">
                          {p.shares !== undefined ? p.shares.toLocaleString() : "--"}
                        </td>
                        <td className="py-2.5 pr-3 text-right numeric">
                          {p.costPrice !== undefined ? p.costPrice.toFixed(3) : "--"}
                        </td>
                        <td className="py-2.5 pr-3 text-right numeric">
                          {p.currentPrice !== undefined ? p.currentPrice.toFixed(3) : "--"}
                        </td>
                        <td className="py-2.5 pr-3 text-right numeric text-white/85">
                          {formatCurrency(p.marketValue)}
                        </td>
                        <td
                          className={cn(
                            "py-2.5 pr-3 text-right numeric",
                            updownClass(p.todayChangePct),
                          )}
                        >
                          {fmtPct(p.todayChangePct)}
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <p className={cn("numeric", updownClass(p.profit))}>
                            {p.profit !== undefined ? formatCurrency(p.profit) : "--"}
                          </p>
                          <p className={cn("text-[10px] numeric", updownClass(p.returnRate))}>
                            {fmtRatio(p.returnRate)}
                          </p>
                        </td>
                        <td className="py-2.5 text-right numeric text-white/50">
                          {(p.weight * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* ── 收益曲线 ── */}
              <GlassCard className="p-5 lg:col-span-2">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                  <Activity className="h-4 w-4 text-brand-electric" />
                  组合价值曲线
                </div>
                {seriesData.length > 1 ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={seriesData}>
                        <defs>
                          <linearGradient id={`${chartId}-g`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={40}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          width={70}
                          tickFormatter={(v: number) => formatCurrency(v)}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "rgba(10,15,26,0.92)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                          formatter={(v) => [formatCurrency(Number(v)), "组合市值"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#0EA5E9"
                          strokeWidth={2}
                          fill={`url(#${chartId}-g)`}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center text-center text-sm text-white/35">
                    收益曲线随每日行情刷新自动累积。
                    <br />
                    连续使用数日后，此处将展示组合价值走势。
                  </div>
                )}
              </GlassCard>

              {/* ── 资产分布 ── */}
              <GlassCard className="p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                  <PieIcon className="h-4 w-4 text-semantic-success" />
                  资产分布
                </div>
                <div className="flex flex-col items-center gap-4">
                  <AllocationDonut data={donutData} size={170} />
                  <div className="w-full space-y-2">
                    {(portfolio.allocation ?? []).map((s, i) => (
                      <div key={s.key} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }}
                        />
                        <span className="flex-1 text-white/60">{s.label}</span>
                        <span className="numeric text-white/80">{formatCurrency(s.value)}</span>
                        <span className="w-12 text-right numeric text-white/40">
                          {(s.weight * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </GlassCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* ── 风险分析 + AI 投资解读（需求六 / 七 / 十）── */}
              <GlassCard className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
                    <ShieldAlert className="h-4 w-4 text-semantic-warn" />
                    风险分析
                  </div>
                  <div className="flex items-center gap-2">
                    {riskMeta && (
                      <StatusBadge tone={riskMeta.tone} dot={false}>
                        {riskMeta.label}
                      </StatusBadge>
                    )}
                    <button
                      type="button"
                      onClick={() => void runInvestmentAnalysis(true)}
                      disabled={isAnalyzing}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-brand-electric/30 bg-brand-electric/10 px-3 text-xs text-brand-electric transition-colors hover:bg-brand-electric/20 disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      AI 投资分析
                    </button>
                  </div>
                </div>

                {risk ? (
                  <div className="space-y-3">
                    <p className="text-sm leading-relaxed text-white/70">{risk.summary}</p>
                    <p className="text-[11px] text-white/40">
                      风险偏好：{risk.userRiskLabel} ·{" "}
                      {risk.matchesProfile ? "组合与偏好匹配" : "组合超出你的风险偏好"}
                    </p>
                    {risk.sharpDrops.length > 0 && (
                      <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3">
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-red-300">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          大跌预警
                        </p>
                        {risk.sharpDrops.map((d) => (
                          <p key={`${d.name}-${d.code}`} className="text-[11px] text-red-200/80">
                            {d.name}（{d.code ?? "—"}）今日 {fmtPct(d.todayChangePct)}
                          </p>
                        ))}
                      </div>
                    )}
                    {risk.alerts.map((a) => (
                      <div
                        key={`${a.severity}-${a.title}`}
                        className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/8"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-white/75">{a.title}</span>
                          <StatusBadge tone={SEVERITY_TONE[a.severity] ?? "warn"} dot={false}>
                            {a.severity === "critical"
                              ? "严重"
                              : a.severity === "warn"
                                ? "注意"
                                : "提示"}
                          </StatusBadge>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
                          {a.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : analysis ? (
                  <div className="space-y-2">
                    {analysis.findings.length === 0 ? (
                      <p className="text-xs text-white/35">组合结构未发现显著风险信号</p>
                    ) : (
                      analysis.findings.map((f) => (
                        <div
                          key={`${f.severity}-${f.title}`}
                          className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/8"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-white/75">{f.title}</span>
                            <StatusBadge tone={SEVERITY_TONE[f.severity] ?? "warn"} dot={false}>
                              {f.severity === "critical"
                                ? "严重"
                                : f.severity === "warn"
                                  ? "注意"
                                  : "提示"}
                            </StatusBadge>
                          </div>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
                            {f.detail}
                          </p>
                        </div>
                      ))
                    )}
                    <p className="pt-1 text-[11px] text-white/35">
                      点击「AI 投资分析」获取结合你的风险偏好与市场环境的完整风险报告与解读。
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-white/40">
                    点击「AI 投资分析」运行 组合 → 市场 → 风险 → AI CFO 完整分析流程。
                  </p>
                )}

                {/* AI 解读 */}
                {intelligence && (
                  <div className="mt-4 rounded-xl border border-brand-electric/15 bg-brand-electric/[0.05] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-brand-electric">
                        <Sparkles className="h-3.5 w-3.5" />
                        AI CFO 解读
                      </p>
                      <span className="text-[10px] text-white/30">
                        {intelligence.narrative.tier === "ai"
                          ? `AI 生成 · ${intelligence.narrative.model ?? ""}`
                          : "本地分析（未消耗 AI 额度）"}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/70">
                      {intelligence.narrative.text}
                    </p>
                  </div>
                )}
              </GlassCard>

              {/* ── 持仓相关新闻（需求九）── */}
              <GlassCard className="p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                  <Newspaper className="h-4 w-4 text-brand-electric" />
                  市场与持仓新闻
                </div>
                {news.length > 0 ? (
                  <div className="space-y-2">
                    {news.slice(0, 8).map((n) => (
                      <a
                        key={n.id}
                        href={n.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          "block rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/8 transition-colors",
                          n.url && "hover:bg-white/[0.06]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex-1 text-xs font-medium leading-relaxed text-white/80">
                            {n.title}
                          </p>
                          {n.related && (
                            <StatusBadge tone="info" dot={false}>
                              持仓相关
                            </StatusBadge>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-white/35">
                          {n.source} · {new Date(n.publishedAt).toLocaleString("zh-CN")}
                          {n.relatedHolding ? ` · 关联：${n.relatedHolding}` : ""}
                          {n.importance === "major" && (
                            <span className="ml-1.5 text-amber-300">重大</span>
                          )}
                        </p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-white/40">
                    {newsNotice ??
                      "当前数据源不提供新闻能力。接入支持新闻的自定义数据源后，此处将展示市场与持仓相关新闻。"}
                  </p>
                )}
              </GlassCard>
            </div>

            {/* ── 合规声明（需求十五）── */}
            <p className="rounded-xl bg-white/[0.02] p-4 text-center text-[11px] leading-relaxed text-white/35 ring-1 ring-white/5">
              {INVESTMENT_DISCLAIMER}
              行情数据来自你配置的数据源（{portfolio.sourceName ?? "未连接"}），更新于{" "}
              {new Date(portfolio.updatedAt).toLocaleString("zh-CN")}。
            </p>
          </>
        )}
      </div>
    </PageTransition>
  );
}
