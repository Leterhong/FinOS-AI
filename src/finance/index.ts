import "server-only";

/**
 * Phase 6.9 金融数据服务层 —— 服务端门面。
 * 类型请从 "@/finance/types" 导入（客户端安全）。
 */

export * from "./types";
export {
  financeSourceStore,
  createProvider,
  resolveProvidersFor,
  hasAnySource,
  FINANCE_PROVIDER_PRESETS,
  getFinancePreset,
  normalizeSymbol,
  CORE_INDICES,
} from "./providers";
export { fetchQuotesForUser, getMarketOverview, NO_SOURCE_NOTICE } from "./market";
export {
  readFinanceCache,
  getPortfolioHistory,
  clearFinanceCache,
} from "./market/cache";
export {
  buildPortfolioView,
  analyzePortfolio,
  NO_INVESTMENT_TEXT,
} from "./portfolio";
export {
  assessInvestmentRisk,
  pushRiskNotifications,
  SHARP_DROP_PCT,
  SHARP_DROP_CRITICAL_PCT,
} from "./risk";
export { getNewsForUser } from "./news";
export { runInvestmentIntelligence } from "./intelligence";
