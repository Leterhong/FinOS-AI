/**
 * Agent Router（Phase 6.5 七）—— 按需启动 Agent。
 *
 * 不再「financial_analysis 意图就全量跑 6 个 Agent」，而是按用户问题
 * 精确选择需要的 Agent：
 *   - 「我的退休计划」      → 仅 Retirement Agent
 *   - 「我的股票风险」      → Investment + Risk
 *   - 「我的投资配置」      → Investment (+ Risk)
 *   - 通用财务分析（无命中）→ 全量 Agent（cashflow/investment/risk/retirement）
 */
import type { ChatIntent } from "../types";
import type { AIAnalysisType, AgentId } from "./types";

interface RouteRule {
  re: RegExp;
  agent: AgentId;
  type: AIAnalysisType;
}

const RULES: RouteRule[] = [
  { re: /(退休|养老|retire|retirement|fire|提早退休)/i, agent: "retirement", type: "retirement_plan" },
  { re: /(投资|股票|基金|资产|配置|组合|持仓|portfolio|invest)/i, agent: "investment", type: "investment_report" },
  { re: /(风险|负债|债务|杠杆|risk)/i, agent: "risk", type: "risk_report" },
  { re: /(现金流|储蓄|收入|支出|开支|攒钱|存钱|cash\s?flow|saving)/i, agent: "cashflow", type: "cfo_summary" },
];

export interface RouteResult {
  type: AIAnalysisType;
  agents: AgentId[];
}

export function routeRequest(question: string, _intent?: ChatIntent): RouteResult {
  const q = question || "";
  const matched: AgentId[] = [];
  let primary: AIAnalysisType = "cfo_summary";

  for (const r of RULES) {
    if (r.re.test(q) && !matched.includes(r.agent)) {
      matched.push(r.agent);
      if (primary === "cfo_summary") primary = r.type; // 首个命中决定缓存类型
    }
  }

  if (matched.length === 0) {
    // 通用财务分析 → 全量 Agent
    return { type: "cfo_summary", agents: ["cashflow", "investment", "risk", "retirement"] };
  }
  return { type: primary, agents: matched };
}

export function selectAgents(question: string): AgentId[] {
  return routeRequest(question).agents;
}
