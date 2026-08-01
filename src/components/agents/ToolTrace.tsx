"use client";

import { motion } from "framer-motion";
import { Wrench, CheckCircle2, XCircle, Database, ArrowDown } from "lucide-react";
import type { ToolCallRecord } from "@/ai/tools/types";

const agentNames: Record<string, string> = {
  planner: "财富规划 Agent",
  cashflow: "现金流分析 Agent",
  investment: "投资规划 Agent",
  risk: "风险评估 Agent",
  retirement: "退休规划 Agent",
  strategy: "财富策略 Agent",
  summary: "综合总结 Agent",
};

/** 把工具参数压缩成一行可读文本。 */
function summarizeParams(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) parts.push(`${k}=[${v.slice(0, 4).join(", ")}${v.length > 4 ? "…" : ""}]`);
    else if (v !== undefined && v !== "") parts.push(`${k}=${String(v)}`);
  }
  return parts.join(" · ");
}

function ToolCallRow({ rec, index }: { rec: ToolCallRecord; index: number }) {
  const ok = rec.status === "success";
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-lg bg-white/[0.03] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="h-3.5 w-3.5 shrink-0 text-brand-electric" />
          <span className="text-sm font-medium text-white/85">{rec.toolLabel}</span>
          <span className="text-[10px] uppercase tracking-wider text-white/25">{rec.tool}</span>
        </div>
        {ok ? (
          <span className="flex items-center gap-1 text-[11px] text-semantic-success shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> 成功
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-semantic-risk shrink-0">
            <XCircle className="h-3.5 w-3.5" /> 失败
          </span>
        )}
      </div>
      {summarizeParams(rec.params) && (
        <p className="mt-1.5 text-[11px] text-white/35">
          参数：{summarizeParams(rec.params)}
        </p>
      )}
      <p className="mt-1 text-[12px] text-white/55 leading-relaxed whitespace-pre-line">
        {rec.summary}
      </p>
      <p className="mt-1 text-[10px] text-white/20">
        {rec.durationMs}ms · {new Date(rec.timestamp).toLocaleTimeString("zh-CN")}
      </p>
    </motion.div>
  );
}

/** 紧凑列表（供聊天报告内联复用）。 */
export function ToolCallList({ records }: { records: ToolCallRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="space-y-2">
      {records.map((rec, i) => (
        <ToolCallRow key={`${rec.agentId}-${rec.tool}-${i}`} rec={rec} index={i} />
      ))}
    </div>
  );
}

/**
 * AI Tool Trace 面板（Agent 中心页使用）。
 * 展示"AI 财富团队工作流"中每个 Agent 自动调用的外部金融工具记录。
 */
export default function ToolTrace({ records }: { records: ToolCallRecord[] }) {
  if (records.length === 0) return null;

  // 按 agentId 分组
  const groups = new Map<string, ToolCallRecord[]>();
  for (const r of records) {
    if (!groups.has(r.agentId)) groups.set(r.agentId, []);
    groups.get(r.agentId)!.push(r);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-6"
    >
      <p className="text-xs uppercase tracking-widest text-white/40 mb-1 flex items-center gap-2">
        <Database className="h-3.5 w-3.5" />
        AI 工具调用记录
      </p>
      <p className="text-[11px] text-white/35 mb-5">
        Tool Router 根据各智能体任务自动调用外部金融工具，结果经真实数据注入分析
      </p>

      <div className="space-y-5">
        {Array.from(groups.entries()).map(([agentId, recs], gi) => (
          <div key={agentId}>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-md bg-brand-purple/15 px-2.5 py-1 text-xs font-medium text-brand-purple">
                {agentNames[agentId] ?? agentId}
              </span>
              <span className="text-[10px] text-white/30">
                调用 {recs.length} 个工具
              </span>
            </div>
            <div className="space-y-2 pl-1">
              {recs.map((rec, i) => (
                <ToolCallRow key={`${rec.tool}-${i}`} rec={rec} index={i} />
              ))}
            </div>
            {gi < groups.size - 1 && (
              <div className="flex items-center gap-2 mt-3 text-white/20">
                <ArrowDown className="h-3.5 w-3.5" />
                <span className="text-[10px]">生成分析</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
