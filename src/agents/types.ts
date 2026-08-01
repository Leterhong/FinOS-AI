import type { AgentKey, FinancialProfile, ProjectionPoint } from "@/data/types";

export interface AgentContext {
  profile: FinancialProfile;
  projection?: ProjectionPoint[];
  question?: string;
}

export interface AgentMetric {
  label: string;
  value: string;
  tone?: "good" | "warn" | "risk";
}

/** 知识来源引用（Phase 3.3 RAG）：仅来自服务端真实检索命中。 */
export interface AgentSource {
  title: string;
  category: string;
  scope: "global" | "personal";
}

export interface AgentAnalysis {
  agent: AgentKey;
  headline: string;
  bullets: string[];
  metrics: AgentMetric[];
  confidence: number;
  /** 本次分析参考的知识来源（"分析依据"展示用）。 */
  sources?: AgentSource[];
}

export type AgentFn = (ctx: AgentContext) => Promise<AgentAnalysis>;
