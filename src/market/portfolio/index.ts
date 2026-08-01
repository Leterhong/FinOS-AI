/**
 * Portfolio 模块公共出口（纯函数 + 类型，客户端 / 服务端共享）。
 * server-only 编排入口请从 "@/market/portfolio/service" 导入。
 */

export * from "./types";
export { STOCK_META, FUND_META, lookupSecurityMeta } from "./metadata";
export { analyzePortfolio, EMPTY_PORTFOLIO_ANALYSIS } from "./analyzer";
export {
  composePortfolioSeries,
  computePortfolioPerformance,
  EMPTY_PORTFOLIO_PERFORMANCE,
  type HoldingHistoryEntry,
} from "./performance";
export { assessPortfolioRisk, EMPTY_PORTFOLIO_RISK } from "./risk";
