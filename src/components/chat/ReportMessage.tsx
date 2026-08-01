"use client";

import { motion } from "framer-motion";
import type { AgentAnalysis } from "@/agents/types";
import type { ToolCallRecord } from "@/ai/tools/types";
import { hasSimulatedToolData } from "@/ai/tools/types";
import { cn } from "@/lib/utils";
import AgentAvatar from "../agents/AgentAvatar";
import { ToolCallList } from "../agents/ToolTrace";
import { SimulatedDataNotice } from "../ui/SimulatedDataNotice";
import type { AgentKey } from "@/data/types";

const agentNames: Record<AgentKey, string> = {
  planner: "财富规划",
  cashflow: "现金流",
  investment: "投资",
  risk: "风险",
  retirement: "退休",
  strategy: "财富策略",
  summary: "综合总结",
};

const toneColor = {
  good: "text-semantic-success",
  warn: "text-semantic-warn",
  risk: "text-semantic-risk",
};

interface ReportMessageProps {
  analyses: AgentAnalysis[];
  summary?: AgentAnalysis;
  /** Phase 3.4 Tool Calling：工具调用记录（AI Tool Trace）。 */
  toolCalls?: ToolCallRecord[];
}

export default function ReportMessage({ analyses, summary, toolCalls }: ReportMessageProps) {
  const detailAnalyses = analyses.filter(
    (a) => a.agent !== "summary" && a.agent !== "strategy"
  );
  const strategy = analyses.find((a) => a.agent === "strategy");

  // ── 分析依据（Phase 3.3 RAG）：聚合所有 Agent 真实检索命中的知识来源 ──
  const sourceMap = new Map<
    string,
    { title: string; category: string; scope: "global" | "personal" }
  >();
  for (const a of [...analyses, ...(summary ? [summary] : [])]) {
    for (const s of a.sources ?? []) {
      sourceMap.set(`${s.scope}:${s.title}`, s);
    }
  }
  const allSources = Array.from(sourceMap.values());

  // ── 模拟数据识别（Phase 7.9）：工具返回摘要带模拟前缀时，UI 必须显式标注 ──
  const simulatedTools = hasSimulatedToolData(toolCalls);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Summary first if available */}
      {summary && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-5 border-l-2 border-brand-purple"
        >
          <div className="flex items-center gap-2 mb-3">
            <AgentAvatar agent="summary" status="done" size="sm" />
            <p className="text-sm font-semibold">执行摘要</p>
          </div>
          <div className="space-y-2">
            {summary.bullets.map((bullet, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="text-sm text-white/70 leading-relaxed"
              >
                {bullet}
              </motion.p>
            ))}
          </div>
        </motion.div>
      )}

      {/* Strategy section (年度财富行动计划) */}
      {strategy && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="glass rounded-2xl p-5 border-l-2 border-brand-electric"
        >
          <div className="flex items-center gap-2 mb-3">
            <AgentAvatar agent="strategy" status="done" size="sm" />
            <p className="text-sm font-semibold">年度财富行动计划</p>
          </div>
          {strategy.headline && (
            <p className="text-sm text-white/80 leading-relaxed mb-3">{strategy.headline}</p>
          )}
          <ol className="space-y-2">
            {strategy.bullets.map((bullet, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="flex items-start gap-2 text-sm text-white/70 leading-relaxed"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-electric/20 text-[11px] font-bold text-brand-electric">
                  {i + 1}
                </span>
                {bullet}
              </motion.li>
            ))}
          </ol>
        </motion.div>
      )}

      {/* Detail cards */}
      <div className="grid grid-cols-1 gap-2">
        {detailAnalyses.map((analysis, i) => (
          <motion.div
            key={analysis.agent}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.1 }}
            className="glass rounded-xl p-4 flex gap-3"
          >
            <AgentAvatar agent={analysis.agent} status="done" size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-white/40 mb-1">
                {agentNames[analysis.agent]}
              </p>
              <p className="text-sm font-medium text-white/90">{analysis.headline}</p>
              {analysis.metrics.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysis.metrics.slice(0, 3).map((m, j) => (
                    <span
                      key={j}
                      className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px]"
                    >
                      <span className="text-white/40">{m.label}: </span>
                      <span className={cn("font-medium numeric", m.tone ? toneColor[m.tone] : "text-white")}>
                        {m.value}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* 分析依据（Phase 3.3 RAG）：仅展示真实检索命中的知识来源 */}
      {allSources.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="glass rounded-xl p-4"
        >
          <p className="text-xs uppercase tracking-wider text-white/40 mb-2">
            分析依据
          </p>
          <div className="flex flex-wrap gap-2">
            {allSources.map((s, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11px]"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    s.scope === "personal" ? "bg-brand-purple" : "bg-brand-electric"
                  )}
                />
                <span className="text-white/70">{s.title}</span>
                <span className="text-white/30">
                  {s.scope === "personal" ? "个人资料" : s.category}
                </span>
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* 工具调用记录（Phase 3.4 Tool Calling）：仅展示真实工具返回 */}
      {toolCalls && toolCalls.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
          className="glass rounded-xl p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs uppercase tracking-wider text-white/40">工具调用</p>
            <SimulatedDataNotice simulated={simulatedTools} variant="compact" />
          </div>
          <ToolCallList records={toolCalls} />
        </motion.div>
      )}

      {/* 金融免责声明 */}
      <p className="px-1 text-[10px] leading-relaxed text-white/25">
        以上内容为基于您的数据与金融知识库的分析意见与教育信息，不构成投资建议，
        不保证任何收益。市场有风险，决策需谨慎。
      </p>
    </motion.div>
  );
}
