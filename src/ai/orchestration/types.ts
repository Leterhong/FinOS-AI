/**
 * AI Orchestration Layer —— 共享类型定义（Phase 6.5）。
 *
 * 该层是 FinOS AI 的「AI 调用总控」，负责：
 *   - 判断是否调用 LLM（缓存命中 / 预算超限 / 简单计算 → 不调用）
 *   - 选择模型与 Agent（按需路由，而非全量并发）
 *   - 读取与写入 AI 分析结果缓存
 *   - 控制 Token 成本与用户额度
 *   - 失败时降级到最近一次缓存结果
 */

import type { AgentAnalysisOutput, WorkflowEvent, WorkflowState } from "../types";
import type { FinancialProfile } from "@/data/types";

/** AI 分析结果类型（缓存键 + TTL 维度）。 */
export type AIAnalysisType =
  | "cfo_summary" // Dashboard 重新分析 / 综合体检
  | "risk_report" // 风险分析报告
  | "investment_report" // 投资分析报告
  | "retirement_plan" // 退休规划
  | "financial_advice" // 对话中的通用财务建议
  | "market_analysis" // 市场分析
  | "chat"; // 通用对话（不缓存）

/** 输入变化严重度。 */
export type ChangeScore = "low" | "medium" | "high";

/** 可被编排层按需启用的分析型 Agent。 */
export type AgentId =
  | "cashflow"
  | "investment"
  | "risk"
  | "retirement"
  | "strategy"
  | "summary";

/** 单条 AI 分析结果缓存记录。 */
export interface AIAnalysisCache {
  id: string;
  userId: string;
  type: AIAnalysisType;
  /** 输入指纹：userId + type + question + 画像摘要 + modelName 的稳定哈希。 */
  inputHash: string;
  modelName: string;
  result: AgentAnalysisOutput[];
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  createdAt: number;
  expireAt: number;
}

/** 画像变化检测报告。 */
export interface ChangeReport {
  assetChangePct: number;
  incomeChangePct: number;
  expenseChangePct: number;
  portfolioChangePct: number;
  goalChange: boolean;
  changeScore: ChangeScore;
}

/** 编排请求。 */
export interface OrchestrationRequest {
  type: AIAnalysisType;
  question: string;
  profile: FinancialProfile;
  userId: string;
  /** 显式指定的 Agent（覆盖路由推断），用于精确按需启动。 */
  agents?: AgentId[];
  /** 忽略缓存强制重算（用户主动「重新分析」）。 */
  force?: boolean;
  /** SSE 事件推送（聊天场景）；后台/调度场景可省略。 */
  emit?: (event: WorkflowEvent) => void;
  /** 生命周期：用户主动 / 后台数据变化 / 定时任务。 */
  lifecycle?: "user" | "background" | "scheduled";
  /** Phase 6.6：用户长期记忆上下文（非空时参与缓存键，记忆变化自动失效缓存）。 */
  memoryContext?: string;
}

/** 编排结果。 */
export interface OrchestrationResult {
  fromCache: boolean;
  /** 因 LLM 失败或预算超限，降级返回旧缓存。 */
  degraded?: boolean;
  type: AIAnalysisType;
  result: AgentAnalysisOutput[];
  state?: WorkflowState;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  modelName: string;
  createdAt: number;
}

/** 用户 AI 调用额度。 */
export interface AIQuota {
  /** 每日最大调用次数。 */
  dailyCalls: number;
  /** 每月最大 Token 数。 */
  monthlyTokens: number;
}
