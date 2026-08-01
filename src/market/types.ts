/**
 * Market Intelligence Layer —— 核心类型定义（Phase 6.4）。
 * 纯类型，客户端 / 服务端共享，禁止引入 server-only。
 *
 * 定位：src/market 是位于 financial-data/providers 之上的「市场智能层」，
 * 复用底层 Provider 获取行情，自身提供指数 / 汇率 / 指标计算 / 市场状态编排。
 */

import type { HistoryPoint, Quote } from "@/financial-data/providers/types";

export type { HistoryPoint, Quote };

/* ------------------------------ 指数与汇率 ------------------------------ */

/** 指数报价 */
export interface IndexQuote {
  /** 指数代码，如 sh000001 / 000300 / 399006 */
  code: string;
  name: string;
  /** 指数点位 */
  value: number;
  /** 当日涨跌幅，-1~1 */
  changeRate: number;
  /** 报价时间 ISO */
  quotedAt: string;
  provider: string;
  simulated: boolean;
}

/** 汇率报价 */
export interface ExchangeRate {
  /** 货币对，如 USD/CNY */
  pair: string;
  rate: number;
  /** 当日涨跌幅，-1~1 */
  changeRate: number;
  quotedAt: string;
  provider: string;
  simulated: boolean;
}

/* ------------------------------ 指标与分析 ------------------------------ */

/** 区间涨跌幅（无足够数据时为 null） */
export interface PeriodChanges {
  day: number | null;
  week: number | null;
  month: number | null;
  year: number | null;
}

/** 单只证券的量化指标（确定性纯函数计算，不依赖 LLM） */
export interface SecurityIndicators {
  /** 区间涨跌幅 */
  changes: PeriodChanges;
  /** 年化收益率（基于历史序列），-1~n */
  annualizedReturn: number | null;
  /** 年化波动率，0~n */
  volatility: number | null;
  /** 最大回撤，0~1（正数表示回撤幅度） */
  maxDrawdown: number | null;
  /** 风险收益比 = 年化收益 / 年化波动率 */
  riskReturnRatio: number | null;
}

/** 单只证券分析结果（股票 / 基金通用） */
export interface SecurityAnalysis {
  code: string;
  name: string;
  type: "stock" | "fund";
  /** 最新报价（获取失败为 null，优雅降级） */
  quote: Quote | null;
  /** 历史序列（可能为空数组） */
  history: HistoryPoint[];
  indicators: SecurityIndicators;
  /** 数据来源状态 */
  source: MarketDataSource;
  simulated: boolean;
}

/* ------------------------------ 数据来源与连接状态 ------------------------------ */

/** 单次取数来源：fresh=实时拉取 / cache=有效缓存 / stale=过期缓存兜底 / none=无数据 */
export type MarketDataSource = "fresh" | "cache" | "stale" | "none";

/**
 * 市场连接状态（Phase 6.4 第十一项）：
 * - connected → 绿色 Connected
 * - cached    → 黄色 Using Cached Data
 * - unavailable → 灰色 No Market Data
 */
export type MarketConnectionStatus = "connected" | "cached" | "unavailable";

export const MARKET_STATUS_META: Record<
  MarketConnectionStatus,
  { label: string; zhLabel: string; tone: "success" | "warn" | "neutral" }
> = {
  connected: { label: "Connected", zhLabel: "市场数据已连接", tone: "success" },
  cached: { label: "Using Cached Data", zhLabel: "使用缓存行情", tone: "warn" },
  unavailable: { label: "No Market Data", zhLabel: "等待连接市场数据源", tone: "neutral" },
};

/* ------------------------------ 市场快照 ------------------------------ */

/** 市场情绪（由指数涨跌聚合） */
export type MarketSentiment = "up" | "down" | "mixed" | "unknown";

/** 市场快照 —— intelligence.getMarketSnapshot() 输出 */
export interface MarketSnapshot {
  status: MarketConnectionStatus;
  /** 数据源标识 */
  provider: string;
  /** 是否为模拟数据（任一子项 simulated 即 true） */
  simulated: boolean;
  generatedAt: string;
  indices: IndexQuote[];
  rates: ExchangeRate[];
  sentiment: MarketSentiment;
  /** 一句话市场概览（模拟数据强制带标注） */
  summary: string;
}

/** 空快照（无市场数据时的优雅降级） */
export const EMPTY_MARKET_SNAPSHOT: MarketSnapshot = {
  status: "unavailable",
  provider: "none",
  simulated: false,
  generatedAt: "",
  indices: [],
  rates: [],
  sentiment: "unknown",
  summary: "等待连接市场数据源",
};

/* ------------------------------ 风险信号 ------------------------------ */

/** 风险信号类型：集中 / 市场 / 流动性 / 波动 */
export type MarketRiskSignalType = "concentration" | "market" | "liquidity" | "volatility";

export type RiskSeverity = "low" | "medium" | "high";

/** 数据驱动的风险信号（供 Risk Agent / Dashboard 使用） */
export interface MarketRiskSignal {
  type: MarketRiskSignalType;
  severity: RiskSeverity;
  title: string;
  /** 引用真实数字的说明，如「单只持仓占比 42%」 */
  detail: string;
  /** 关键指标数值（比例 / 百分数按 0~1 存储） */
  metric?: number;
}
