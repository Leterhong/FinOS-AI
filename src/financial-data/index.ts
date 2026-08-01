import "server-only";

/**
 * Financial Data Layer —— Phase 6 Real Financial Data OS 服务端总出口。
 * 客户端请从 "@/financial-data/types" / "@/financial-data/connectors" 单独引入纯共享模块。
 */

export * from "./types";
export { CONNECTORS, getConnector } from "./connectors";
export { parseFile, detectFormat } from "./parsers";
export {
  normalizeTransactions,
  normalizeHoldings,
  extractPolicyFromText,
  parseDate,
  parseAmount,
} from "./normalizer";
export { classifyTransactions, classifyByRule } from "./classifier";
export { financeDb } from "./storage";
export { buildSummary } from "./summary";
export { rebuildTwinFromData } from "./twin-builder";
export { generateInsights } from "./insight";
export {
  importFinancialFile,
  getFinancialSummary,
  refreshFinancialData,
  syncHoldingQuotes,
} from "./sync";
export { getStockProvider, getFundProvider } from "./providers";
export {
  addManualAsset,
  updateManualAsset,
  deleteManualAsset,
  validateManualAsset,
} from "./manual";
export { toRealDataContext } from "./real-context";
export {
  DATA_SCOPES,
  DATA_SCOPE_LABELS,
  getUserConsent,
  setUserConsent,
  hasConsent,
  logDataAccess,
  filterRealDataByConsent,
} from "./consent";
export type { DataScope, ConsentRecord, DataAccessLogEntry } from "./consent";
