import "server-only";

// ── ToolRouter（Phase 3.4 Real World Financial Intelligence Layer）──────────
// 根据 Agent 任务自动选择并调用金融工具，返回调用记录与可注入 Prompt 的上下文。
//   Investment Agent → MarketDataTool + FundDataTool
//   Risk Agent       → MacroDataTool + NewsTool
// 其余 Agent 本阶段不挂工具（返回空记录）。

import type { FinancialContextData } from "../types";
import type { FinancialTool, ToolCallRecord, ToolContext } from "./types";
import { marketDataTool } from "./market-data";
import { fundDataTool } from "./fund-data";
import { macroDataTool } from "./macro-data";
import { newsTool } from "./news";

/** 工具注册表（名称 → 实例）。 */
const TOOL_REGISTRY: Record<string, FinancialTool> = {
  MarketDataTool: marketDataTool,
  FundDataTool: fundDataTool,
  MacroDataTool: macroDataTool,
  NewsTool: newsTool,
};

/** Agent → 工具映射（决定每个智能体可自动调用的外部能力）。 */
const AGENT_TOOL_NAMES: Record<string, string[]> = {
  investment: ["MarketDataTool", "FundDataTool"],
  risk: ["MacroDataTool", "NewsTool"],
};

/** 从用户画像 + 问题推导某工具的查询参数。 */
function buildParams(
  toolName: string,
  context: FinancialContextData,
  userQuestion?: string
): Record<string, unknown> {
  const profile = context.profile;
  switch (toolName) {
    case "MarketDataTool":
      // 持仓含权益类（股票/基金）时查询对应宽基行情；债券/货币类占比高时也给出参考
      return {
        symbols: ["HS300", "SSE", "SZSE", "CYB", "SPX", "NDX"],
        riskLevel: profile.riskLevel,
      };
    case "FundDataTool":
      // 若用户持有基金则聚焦其基金，否则给代表性基金池作为市场参考
      return {
        codes: profile.funds > 0 ? ["110011", "161725", "005827", "003095"] : ["110011", "161725", "005827"],
      };
    case "MacroDataTool":
      return { country: "CN" };
    case "NewsTool":
      return {
        query: userQuestion?.slice(0, 40) ?? "宏观经济 市场风险 投资组合",
        limit: 5,
      };
    default:
      return {};
  }
}

class ToolRouter {
  /**
   * 为指定 Agent 执行其全部关联工具，返回调用记录与 Prompt 上下文。
   * 单个工具失败不影响其他工具（容错）。
   */
  async executeForAgent(
    agentId: string,
    context: FinancialContextData,
    userQuestion?: string
  ): Promise<ToolContext> {
    const names = AGENT_TOOL_NAMES[agentId];
    if (!names || names.length === 0) {
      return { text: "", records: [] };
    }

    const records: ToolCallRecord[] = [];
    for (const name of names) {
      const tool = TOOL_REGISTRY[name];
      if (!tool) continue;
      const params = buildParams(name, context, userQuestion);
      const started = Date.now();
      try {
        const result = await tool.execute(params);
        records.push({
          agentId,
          tool: tool.name,
          toolLabel: tool.label,
          params,
          status: result.status,
          summary: result.summary,
          durationMs: Date.now() - started,
          timestamp: started,
          error: result.error,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "工具调用异常";
        records.push({
          agentId,
          tool: tool.name,
          toolLabel: tool.label,
          params,
          status: "error",
          summary: `工具调用异常：${message}`,
          durationMs: Date.now() - started,
          timestamp: started,
          error: message,
        });
      }
    }

    return { text: this.formatContext(records), records };
  }

  /** 把调用记录格式化为可注入 Prompt 的文本。 */
  private formatContext(records: ToolCallRecord[]): string {
    if (records.length === 0) return "";
    const blocks = records
      .map((r) => {
        const head = `### ${r.toolLabel}（${r.tool}）`;
        const body =
          r.status === "success"
            ? r.summary
            : `调用失败：${r.error ?? "未知错误"}`;
        return `${head}\n${body}`;
      })
      .join("\n\n");
    return `以下为 Tool Router 自动调用外部金融工具返回的真实数据，请基于这些数据进行分析，引用具体数值，不要编造工具未提供的数字：\n\n${blocks}`;
  }
}

export const toolRouter = new ToolRouter();
export { AGENT_TOOL_NAMES, TOOL_REGISTRY };
