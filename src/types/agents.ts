/**
 * Phase 7.2 智能体生态 —— 强类型契约。
 * 字段命名对齐后端 `backend/agents/*`（camelCase 返回）。
 */

/** Marketplace 列表项（含用户级开关状态）。 */
export interface AgentMeta {
  name: string;
  title: string;
  domain: string;
  description: string;
  defaultEnabled: boolean;
  defaultPriority: number;
  tools: string[];
  // 用户级覆盖字段
  enabled: boolean;
  priority: number;
  focus: string;
  settings: Record<string, unknown>;
  configured: boolean;
}

export interface MarketplaceResult {
  items: AgentMeta[];
}

/** 单个 Agent 的三段式结果。 */
export interface AgentResultItem {
  agent: string;
  title: string;
  ok: boolean;
  tier: string;
  score?: number | null;
  headline: string;
  cause: string[];
  impact: string[];
  advice: string[];
  metrics?: Record<string, unknown>;
  toolsUsed?: string[];
  elapsedMs: number;
  error?: string;
  text?: string;
  disclaimer?: string;
}

export interface RunSingleResult {
  hasData: boolean;
  result: AgentResultItem;
  welcome?: string;
}

export interface WorkflowResult {
  hasData: boolean;
  question: string;
  results: AgentResultItem[];
  trace?: unknown;
  summary?: string;
  elapsedMs?: number;
  context?: unknown;
  disclaimer?: string;
  welcome?: string;
}

export interface RunLogItem {
  id: string;
  kind: string;
  agentName: string;
  question?: string;
  tier?: string;
  ok: boolean;
  elapsedMs?: number;
  summary?: unknown;
  createdAt?: string;
}

export interface RunsResult {
  items: RunLogItem[];
}

export interface ToolInfo {
  name: string;
  description?: string;
  params?: unknown;
  [key: string]: unknown;
}

export interface ToolsResult {
  items: ToolInfo[];
}

export interface AgentConfigureBody {
  enabled?: boolean;
  priority?: number;
  focus?: string;
  settings?: Record<string, unknown>;
}
