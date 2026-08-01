/**
 * Phase 6.9 金融数据服务层 —— 统一类型定义（客户端 / 服务端共享，无 server-only）。
 *
 * 设计原则（需求一 / 二 / 十四 / 十五）：
 *  - Provider Adapter 模式：MarketDataProvider / NewsProvider 是唯一数据入口，
 *    不绑定单一数据源；行情数据必须来自 Provider，禁止模拟价格 / 硬编码。
 *  - 数据源由用户配置（仿模型 API 配置）：API 地址 / API Key / 来源名称。
 *  - 合规：统一免责声明，不承诺收益、不自动交易、不给确定性投资建议。
 */

/* -------------------------------------------------------------------------- */
/*  合规声明（需求十五）                                                          */
/* -------------------------------------------------------------------------- */

/** Phase 6.9 投资域统一免责声明（页面 / 报告 / AI 输出统一携带） */
export const INVESTMENT_DISCLAIMER =
  "FinOS AI提供信息分析和辅助决策，不构成投资建议。";

/* -------------------------------------------------------------------------- */
/*  行情基础类型                                                                 */
/* -------------------------------------------------------------------------- */

/** 股票实时报价 */
export interface StockQuote {
  /** 标准化代码，如 sh600519 / sz000001 / hk00700 / usAAPL */
  symbol: string;
  name: string;
  /** 最新价 */
  price: number;
  /** 昨收 */
  prevClose?: number;
  /** 涨跌额 */
  change?: number;
  /** 涨跌幅（%），如 -2.35 表示 -2.35% */
  changePct?: number;
  currency?: string;
  /** 行情时间（ISO） */
  timestamp: string;
  /** 数据来源名称（Provider label） */
  source: string;
}

/** 基金净值 */
export interface FundNAV {
  code: string;
  name: string;
  /** 单位净值 */
  nav: number;
  /** 净值日期（YYYY-MM-DD） */
  navDate?: string;
  /** 日涨跌幅（%） */
  changePct?: number;
  timestamp: string;
  source: string;
}

/** 市场指数 */
export interface MarketIndexQuote {
  /** 如 sh000001（上证指数）/ sz399001 / sz399006 */
  code: string;
  name: string;
  value: number;
  change?: number;
  changePct?: number;
  timestamp: string;
  source: string;
}

/** 历史行情点 */
export interface HistoricalPoint {
  /** YYYY-MM-DD */
  date: string;
  close: number;
}

/** 历史行情序列 */
export interface HistoricalSeries {
  symbol: string;
  points: HistoricalPoint[];
  source: string;
}

/* -------------------------------------------------------------------------- */
/*  金融新闻（需求九）                                                            */
/* -------------------------------------------------------------------------- */

export type NewsScope = "market" | "company" | "industry";

export interface FinanceNewsItem {
  id: string;
  title: string;
  summary?: string;
  /** 新闻来源（媒体 / Provider 名） */
  source: string;
  url?: string;
  /** ISO 时间 */
  publishedAt: string;
  scope?: NewsScope;
  /** 关联标的代码（用于持仓联动提醒） */
  symbols?: string[];
  /** 重大新闻标记（触发 AI 提醒） */
  importance?: "normal" | "major";
}

/* -------------------------------------------------------------------------- */
/*  Provider 接口（需求二）                                                       */
/* -------------------------------------------------------------------------- */

/** Provider 能力声明：MarketService 按能力路由到不同数据源 */
export interface ProviderCapabilities {
  stock: boolean;
  fund: boolean;
  index: boolean;
  history: boolean;
  news: boolean;
}

/** 金融行情数据提供商统一接口（Adapter 模式核心） */
export interface MarketDataProvider {
  readonly kind: FinanceProviderKind;
  /** 数据来源展示名（用户配置的名称优先） */
  readonly label: string;
  readonly capabilities: ProviderCapabilities;
  /** 获取股票价格（批量） */
  getStockPrice(symbols: string[]): Promise<StockQuote[]>;
  /** 获取基金净值（批量） */
  getFundNAV(codes: string[]): Promise<FundNAV[]>;
  /** 获取市场指数（缺省取核心指数） */
  getMarketIndex(codes?: string[]): Promise<MarketIndexQuote[]>;
  /** 获取历史数据 */
  getHistoricalData(symbol: string, days?: number): Promise<HistoricalSeries>;
}

/** 金融新闻提供商接口 */
export interface NewsProvider {
  getNews(opts?: { symbols?: string[]; limit?: number }): Promise<FinanceNewsItem[]>;
}

/* -------------------------------------------------------------------------- */
/*  数据源配置（需求三，仿模型 API 配置）                                            */
/* -------------------------------------------------------------------------- */

/**
 * 内置 Adapter 种类：
 *  - tencent-quote：腾讯行情公开接口（股票 / 指数 / 历史，免 Key）
 *  - eastmoney-fund：天天基金公开净值接口（基金，免 Key）
 *  - custom：自定义 HTTP JSON 数据源（用户提供 API 地址 + API Key，全能力）
 */
export type FinanceProviderKind = "tencent-quote" | "eastmoney-fund" | "custom";

export type FinanceSourceStatus = "untested" | "online" | "error";

export interface FinanceSourceInput {
  kind: FinanceProviderKind;
  /** 数据来源名称（用户自定义显示名） */
  name?: string;
  /** API 地址（custom 必填；内置源可留空用默认） */
  baseUrl?: string;
  /** API Key（留空 = 不修改 / 无需 Key） */
  apiKey?: string;
}

/** 前端安全视图（Key 只暴露掩码） */
export interface PublicFinanceSource {
  id: string;
  userId: string;
  kind: FinanceProviderKind;
  name: string;
  baseUrl?: string;
  keyMask: string;
  status: FinanceSourceStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
}

/* -------------------------------------------------------------------------- */
/*  投资组合（需求四 / 五 / 六）                                                   */
/* -------------------------------------------------------------------------- */

/** 行情获取状态：live=实时 / cached=缓存降级 / none=无数据源或无行情 */
export type QuoteFreshness = "live" | "cached" | "none";

/** 单个持仓的组合视图（股票 / 基金） */
export interface PortfolioPosition {
  holdingId: string;
  name: string;
  code?: string;
  type: "stock" | "fund";
  /** 持仓数量（股）/ 基金份额 */
  shares?: number;
  /** 成本价（单位成本） */
  costPrice?: number;
  /** 当前价格 / 净值（来自 Provider 或缓存） */
  currentPrice?: number;
  /** 当前市值 */
  marketValue: number;
  /** 累计成本 */
  totalCost?: number;
  /** 盈亏金额 */
  profit?: number;
  /** 收益率（小数，0.12 = +12%） */
  returnRate?: number;
  /** 今日涨跌幅（%） */
  todayChangePct?: number;
  /** 持仓比例（占投资组合，0-1） */
  weight: number;
  /** 行情新鲜度 */
  quoteStatus: QuoteFreshness;
  /** 行情时间 */
  quoteTime?: string;
  /** 数据来源 */
  quoteSource?: string;
}

/** 资产分布条目 */
export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  /** 0-1 */
  weight: number;
}

/** 投资组合聚合视图（组合引擎输出，纯代码计算） */
export interface PortfolioView {
  userId: string;
  /** 是否有投资持仓（验收测试 4：无投资 → 暂无投资数据） */
  hasInvestments: boolean;
  positions: PortfolioPosition[];
  totalValue: number;
  totalCost?: number;
  totalProfit?: number;
  /** 组合累计收益率（小数） */
  totalReturnRate?: number;
  /** 今日变化金额（基于有行情的持仓） */
  todayChangeValue?: number;
  /** 今日变化幅度（%） */
  todayChangePct?: number;
  /** 按持仓类型的资产分布 */
  allocation: AllocationSlice[];
  /** 整体数据状态：live / cached（降级）/ partial / none */
  dataStatus: "live" | "cached" | "partial" | "none";
  /** 缓存降级 / 无数据源提示（验收测试 5） */
  dataNotice?: string;
  /** 使用的数据来源名称 */
  sourceName?: string;
  updatedAt: string;
  disclaimer: string;
}

/** 组合价值历史点（收益曲线，随每次刷新按日累积快照） */
export interface PortfolioValuePoint {
  date: string;
  value: number;
  profit?: number;
}

/* -------------------------------------------------------------------------- */
/*  组合智能分析 / 风险（需求六 / 七）                                              */
/* -------------------------------------------------------------------------- */

export type RiskGrade = "low" | "medium" | "high";

export interface PortfolioFinding {
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
}

/** Portfolio Intelligence 本地分析结果（零 LLM） */
export interface PortfolioAnalysis {
  /** 投资健康评分 0-100 */
  healthScore: number;
  scoreGrade: "excellent" | "good" | "fair" | "poor";
  /** 单一持仓最大占比（0-1） */
  topPositionWeight: number;
  topPositionName?: string;
  /** 股票类资产占投资组合比例（0-1） */
  stockShare: number;
  fundShare: number;
  /** 集中度评级 */
  concentration: RiskGrade;
  /** 波动情况（基于持仓今日涨跌离散度，数据不足为 undefined） */
  volatilityPct?: number;
  findings: PortfolioFinding[];
  computedAt: string;
}

/** 投资风险报告（结合用户风险等级 + 市场 + 组合，需求七） */
export interface InvestmentRiskReport {
  /** 综合风险等级 */
  riskGrade: RiskGrade;
  /** 用户画像风险偏好标签 */
  userRiskLabel: string;
  /** 组合与风险偏好是否匹配 */
  matchesProfile: boolean;
  alerts: PortfolioFinding[];
  /** 大跌预警的持仓（今日跌幅超阈值） */
  sharpDrops: Array<{
    name: string;
    code?: string;
    todayChangePct: number;
  }>;
  summary: string;
  computedAt: string;
  disclaimer: string;
}

/* -------------------------------------------------------------------------- */
/*  市场环境（需求八）                                                            */
/* -------------------------------------------------------------------------- */

export type MarketTrend = "up" | "down" | "sideways" | "unknown";

/** Market Agent 本地市场环境结论（信息分析 + 风险提示，不推荐买卖） */
export interface MarketOverview {
  indices: MarketIndexQuote[];
  trend: MarketTrend;
  trendNote: string;
  dataStatus: "live" | "cached" | "none";
  dataNotice?: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  AI 投资分析流程（需求十 / 十三）                                                */
/* -------------------------------------------------------------------------- */

/** AI 投资分析结果（Portfolio → Market → Risk → Investment → AI CFO） */
export interface InvestmentIntelligenceResult {
  portfolio: PortfolioView;
  analysis: PortfolioAnalysis | null;
  risk: InvestmentRiskReport | null;
  market: MarketOverview;
  /** AI 解读（local=本地模板 / ai=LLM 生成） */
  narrative: {
    tier: "local" | "ai";
    text: string;
    model?: string;
    reason?: string;
  };
  aiCalls: number;
  disclaimer: string;
  generatedAt: string;
}
