import "server-only";

// ── Tool Layer 总入口（Phase 3.4）───────────────────────────────────────────
export type {
  FinancialTool,
  ToolResult,
  ToolCallRecord,
  ToolContext,
} from "./types";
export { toolRouter, AGENT_TOOL_NAMES, TOOL_REGISTRY } from "./router";
export { marketDataTool } from "./market-data";
export { fundDataTool } from "./fund-data";
export { macroDataTool } from "./macro-data";
export { newsTool } from "./news";
