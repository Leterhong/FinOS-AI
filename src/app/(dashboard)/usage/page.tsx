"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import PageTransition from "@/components/dashboard/PageTransition";
import GradientText from "@/components/ui/GradientText";
import {
  Activity,
  Zap,
  ArrowDownUp,
  ArrowUpDown,
  DollarSign,
  Clock,
  Boxes,
  SlidersHorizontal,
} from "lucide-react";
import { useAiUsage, type AiUsageRow } from "@/hooks/use-backend";

/* ───────────────────────── 格式化工具 ───────────────────────── */

function fmtInt(n: number): string {
  return (n ?? 0).toLocaleString("en-US");
}
function fmtCompact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + "k";
  return String(Math.round(n));
}
function fmtCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return "$0";
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
/** 向上取整到「好看」的刻度上限（1/2/2.5/5/10 × 10^k）。 */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / pow;
  let nf: number;
  if (f <= 1) nf = 1;
  else if (f <= 2) nf = 2;
  else if (f <= 2.5) nf = 2.5;
  else if (f <= 5) nf = 5;
  else nf = 10;
  return nf * pow;
}

/* 各模型公开参考单价（美元 / 千 Token，输入输出近似统一），仅供成本感知，非实际账单。
   未知模型按 0 估算，绝不编造价格。 */
const REF_PRICE_PER_1K: Record<string, number> = {
  "gpt-4o": 0.005,
  "gpt-4o-mini": 0.00015,
  "gpt-4-turbo": 0.01,
  "gpt-4": 0.03,
  "gpt-3.5-turbo": 0.0015,
  "claude-3-5-sonnet": 0.003,
  "claude-3-5-haiku": 0.0008,
  "claude-3-haiku": 0.00025,
  "claude-3-opus": 0.015,
  "deepseek-chat": 0.00027,
  "deepseek-reasoner": 0.00055,
  "qwen-max": 0.0004,
  "qwen-plus": 0.0002,
  "glm-4": 0.00027,
  "gemini-1.5-pro": 0.0035,
  "gemini-1.5-flash": 0.00015,
};
function estCost(tokens: number, model: string): number {
  const p = REF_PRICE_PER_1K[model.toLowerCase()] ?? 0;
  return (tokens / 1000) * p;
}

/* ───────────────────────── 纯 SVG 柱状图（零依赖） ───────────────────────── */

interface ColSeries {
  key: string;
  label: string;
  color: string;
}
interface ColPoint {
  label: string;
  values: Record<string, number>;
}

function ColumnChart({
  data,
  series,
  unit = "",
  height = 300,
}: {
  data: ColPoint[];
  series: ColSeries[];
  unit?: string;
  height?: number;
}) {
  const W = 680;
  const H = height;
  const mLeft = 52;
  const mRight = 16;
  const mTop = 24;
  const mBottom = 64;
  const plotW = W - mLeft - mRight;
  const plotH = H - mTop - mBottom;
  const baseline = mTop + plotH;

  const totals = data.map((d) => series.reduce((s, ser) => s + (d.values[ser.key] || 0), 0));
  const niceMax = niceCeil(Math.max(1, ...totals));
  const ticks = 4;
  const slot = data.length ? plotW / data.length : plotW;
  const barW = Math.min(64, slot * 0.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="AI 用量柱状图">
      {/* y 轴网格与刻度 */}
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const v = (niceMax / ticks) * i;
        const y = baseline - (v / niceMax) * plotH;
        return (
          <g key={i}>
            <line x1={mLeft} y1={y} x2={W - mRight} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            <text x={mLeft - 8} y={y + 4} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.4)">
              {fmtCompact(v)}
            </text>
          </g>
        );
      })}

      {/* 柱子（堆叠） */}
      {data.map((d, i) => {
        const x = mLeft + slot * i + (slot - barW) / 2;
        const total = totals[i];
        let acc = 0;
        return (
          <g key={d.label}>
            {series.map((ser) => {
              const v = d.values[ser.key] || 0;
              const h = (v / niceMax) * plotH;
              const y = baseline - acc - h;
              acc += h;
              return (
                <rect key={ser.key} x={x} y={y} width={barW} height={Math.max(0, h)} fill={ser.color} rx={3} />
              );
            })}
            {total > 0 && (
              <text
                x={x + barW / 2}
                y={baseline - (total / niceMax) * plotH - 6}
                textAnchor="middle"
                fontSize={10}
                fill="rgba(255,255,255,0.78)"
              >
                {fmtCompact(total)}
              </text>
            )}
            <text x={x + barW / 2} y={baseline + 16} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.55)">
              {truncate(d.label, 9)}
            </text>
            {unit && (
              <text x={x + barW / 2} y={baseline + 30} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.3)">
                {unit}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────────────────── 页面 ───────────────────────── */

function StatCard({
  icon,
  label,
  value,
  hint,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="glass rounded-2xl p-6"
    >
      <div className="flex items-center gap-2 text-brand-electric">{icon}</div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-white/40">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-white/40">{hint}</p>}
    </motion.div>
  );
}

const REQUEST_LABEL: Record<string, string> = {
  generate: "生成",
  stream: "流式",
  embed: "向量",
};

export default function UsageCenterPage() {
  const { data, isLoading, isError } = useAiUsage();

  const rows = useMemo<AiUsageRow[]>(() => data?.usage ?? [], [data?.usage]);
  const totals = data?.totals;

  // 按模型聚合（跨 requestType 求和），用于柱状图与排行
  const byModel = useMemo(() => {
    const map = new Map<string, { model: string; calls: number; tokens: number; input: number; output: number }>();
    for (const r of rows) {
      const key = r.model || "未命名模型";
      const cur = map.get(key) ?? { model: key, calls: 0, tokens: 0, input: 0, output: 0 };
      cur.calls += r.calls;
      cur.tokens += r.tokens;
      cur.input += r.inputTokens;
      cur.output += r.outputTokens;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.tokens - a.tokens);
  }, [rows]);

  const modelChartData = byModel.map((m) => ({
    label: m.model,
    values: { input: m.input, output: m.output },
  }));
  const callChartData = byModel.map((m) => ({
    label: m.model,
    values: { calls: m.calls },
  }));

  const totalEstCost = useMemo(
    () => rows.reduce((s, r) => s + estCost(r.tokens, r.model), 0),
    [rows],
  );

  const empty = !isLoading && rows.length === 0;

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-brand-purple/70 mb-2">
            AI 用量中心
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            <GradientText>AI 用量与成本</GradientText>
          </h1>
          <p className="mt-2 text-sm text-white/40 max-w-2xl">
            按模型聚合的 AI 调用审计：调用次数、Token 消耗（输入 / 输出）与参考单价估算成本。所有数据基于你的真实模型配置按需消耗，未使用的模型不产生任何 Token。
          </p>
          <Link
            href="/settings/ai-usage"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            设置用量限额
          </Link>
        </motion.div>

        {isError ? (
          <div className="glass rounded-2xl p-8 text-center text-sm text-white/50">
            用量数据加载失败，请稍后重试或重新登录后查看。
          </div>
        ) : empty ? (
          <div className="glass rounded-2xl p-10 text-center">
            <Boxes className="mx-auto mb-4 h-10 w-10 text-white/30" />
            <p className="text-sm text-white/50">
              暂无调用记录。当你在 AI 财富顾问、智能体中心或财富实验室主动发起分析后，这里会显示各模型的 Token 与成本分布。
            </p>
          </div>
        ) : (
          <>
            {/* 累计核心指标 */}
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <StatCard
                icon={<Activity className="h-5 w-5" />}
                label="累计调用次数"
                value={isLoading ? "—" : fmtInt(totals?.calls ?? 0)}
                hint="全部请求类型合计"
                delay={0}
              />
              <StatCard
                icon={<Zap className="h-5 w-5" />}
                label="累计 Token"
                value={isLoading ? "—" : fmtInt(totals?.tokens ?? 0)}
                hint="输入 + 输出 Token"
                delay={0.1}
              />
              <StatCard
                icon={<ArrowDownUp className="h-5 w-5" />}
                label="累计输入 Token"
                value={isLoading ? "—" : fmtInt(totals?.inputTokens ?? 0)}
                hint="提示词与上下文"
                delay={0.2}
              />
              <StatCard
                icon={<ArrowUpDown className="h-5 w-5" />}
                label="累计输出 Token"
                value={isLoading ? "—" : fmtInt(totals?.outputTokens ?? 0)}
                hint="模型生成内容"
                delay={0.3}
              />
            </div>

            {/* Token 柱状图（输入/输出堆叠） */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="glass rounded-2xl p-6"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-brand-electric" />
                  <h2 className="text-lg font-semibold text-white">各模型 Token 消耗</h2>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-white/50">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#00D68F" }} />
                    输入
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#22D3EE" }} />
                    输出
                  </span>
                </div>
              </div>
              {isLoading ? (
                <div className="py-16 text-center text-sm text-white/30">加载中…</div>
              ) : (
                <ColumnChart
                  data={modelChartData}
                  series={[
                    { key: "input", label: "输入", color: "#00D68F" },
                    { key: "output", label: "输出", color: "#22D3EE" },
                  ]}
                  unit="Token"
                />
              )}
            </motion.div>

            {/* 调用次数柱状图 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="glass rounded-2xl p-6"
            >
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-electric" />
                <h2 className="text-lg font-semibold text-white">各模型调用次数</h2>
              </div>
              {isLoading ? (
                <div className="py-16 text-center text-sm text-white/30">加载中…</div>
              ) : (
                <ColumnChart
                  data={callChartData}
                  series={[{ key: "calls", label: "调用", color: "#00D68F" }]}
                  unit="次"
                />
              )}
            </motion.div>

            {/* 模型排行 / 明细表 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="glass rounded-2xl p-6"
            >
              <div className="mb-5 flex items-center gap-2">
                <Boxes className="h-4 w-4 text-brand-electric" />
                <h2 className="text-lg font-semibold text-white">模型调用明细</h2>
                <span className="ml-auto text-[11px] text-white/35">
                  估算成本合计 {fmtCost(totalEstCost)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-white/35">
                      <th className="px-3 py-2 font-medium">模型</th>
                      <th className="px-3 py-2 font-medium">类型</th>
                      <th className="px-3 py-2 text-right font-medium">调用</th>
                      <th className="px-3 py-2 text-right font-medium">Token</th>
                      <th className="px-3 py-2 text-right font-medium">输入</th>
                      <th className="px-3 py-2 text-right font-medium">输出</th>
                      <th className="px-3 py-2 text-right font-medium">平均耗时</th>
                      <th className="px-3 py-2 text-right font-medium">估算成本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .slice()
                      .sort((a, b) => b.tokens - a.tokens)
                      .map((r, i) => (
                        <tr key={`${r.model}-${r.requestType}-${i}`} className="border-t border-white/5">
                          <td className="px-3 py-2.5 text-white/85">{r.model || "未命名模型"}</td>
                          <td className="px-3 py-2.5 text-white/45">
                            {REQUEST_LABEL[r.requestType] ?? r.requestType}
                          </td>
                          <td className="px-3 py-2.5 text-right text-white/70">{fmtInt(r.calls)}</td>
                          <td className="px-3 py-2.5 text-right text-white/70">{fmtInt(r.tokens)}</td>
                          <td className="px-3 py-2.5 text-right text-white/50">{fmtInt(r.inputTokens)}</td>
                          <td className="px-3 py-2.5 text-right text-white/50">{fmtInt(r.outputTokens)}</td>
                          <td className="px-3 py-2.5 text-right text-white/50">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {r.avgLatencyMs}ms
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-white/80">
                            <span className="inline-flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {fmtCost(estCost(r.tokens, r.model))}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </motion.div>

            <p className="text-center text-[11px] text-white/30">
              成本按各模型公开参考单价（每千 Token）估算，仅供成本感知，不构成实际账单。未知模型按 0 估算，不会编造价格。
            </p>
          </>
        )}
      </div>
    </PageTransition>
  );
}
