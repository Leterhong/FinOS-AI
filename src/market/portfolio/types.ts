/**
 * Portfolio Analyzer / Performance Engine —— 类型定义（Phase 6.4 第三 / 四项）。
 * 纯类型，客户端 / 服务端共享。
 */

import type { AssetAllocationSlice, HoldingType } from "@/financial-data/types";
import type { HistoryPoint, PeriodChanges, RiskSeverity } from "@/market/types";

/** 通用配置切片（行业 / 地区维度） */
export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  /** 占组合总值比例 0~1 */
  ratio: number;
}

/** Top 持仓条目 */
export interface TopHolding {
  name: string;
  code?: string;
  type: HoldingType;
  marketValue: number;
  /** 占组合总值比例 0~1 */
  ratio: number;
  /** 收益率（有成本数据时） */
  returnRate?: number;
}

/** 集中度分析 */
export interface ConcentrationInfo {
  /** 最大单只持仓占比（不含现金） 0~1 */
  top1Ratio: number;
  /** 前三大持仓占比 0~1 */
  top3Ratio: number;
  /** Herfindahl-Hirschman 指数 0~1（越高越集中） */
  hhi: number;
  level: RiskSeverity;
}

/** 组合配置分析结果（Portfolio Analyzer 输出，确定性纯函数） */
export interface PortfolioAnalysis {
  /** 是否有持仓数据 */
  hasData: boolean;
  /** 组合总值（含现金） */
  totalValue: number;
  /** 投资类资产总值（不含现金） */
  investedValue: number;
  cashValue: number;
  /** 现金占比 0~1 */
  cashRatio: number;
  /** 按资产类别配置（现金 / 股票 / 基金 ...） */
  byClass: AssetAllocationSlice[];
  /** 按行业配置 */
  bySector: AllocationSlice[];
  /** 按地区配置 */
  byRegion: AllocationSlice[];
  /** Top 持仓（按市值降序，最多 5 条） */
  topHoldings: TopHolding[];
  concentration: ConcentrationInfo;
  holdingCount: number;
}

/** 组合收益分析结果（Performance Engine 输出） */
export interface PortfolioPerformance {
  hasData: boolean;
  /** 合成组合净值序列（按持仓市值加权历史） */
  series: HistoryPoint[];
  /** 日 / 周 / 月 / 年收益率 */
  changes: PeriodChanges;
  annualizedReturn: number | null;
  /** 年化波动率 */
  volatility: number | null;
  /** 最大回撤 0~1 */
  maxDrawdown: number | null;
  /** 风险收益比 */
  riskReturnRatio: number | null;
  /** 累计浮动盈亏（来自持仓成本数据） */
  totalProfit: number;
  /** 累计收益率（profit / cost，无成本数据为 null） */
  totalReturnRate: number | null;
  /** 历史数据是否为模拟行情 */
  simulated: boolean;
}

/** 组合风险评估（确定性规则，供 Dashboard 风险评分 + Risk Agent 输入） */
export interface PortfolioRiskAssessment {
  /** 风险评分 0~100（越高越危险） */
  score: number;
  level: RiskSeverity;
  signals: import("@/market/types").MarketRiskSignal[];
}
