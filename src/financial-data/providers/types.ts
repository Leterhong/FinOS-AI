/**
 * Data Provider Adapter —— 外部行情数据源统一接口。
 * 纯类型 + 接口定义，客户端 / 服务端共享，禁止引入 server-only。
 *
 * 设计原则（Phase 6.3 第五 / 六项）：
 * - 不写死数据源：Mock / 真实券商 API / 基金 API 都实现同一接口
 * - 未来接入真实 API 时只需新增实现 + 在注册表切换，管道不变
 */

/** 实时报价 */
export interface Quote {
  /** 证券代码，如 600519 / 000001 / 110011 */
  code: string;
  /** 名称 */
  name: string;
  /** 当前价格 / 净值 */
  price: number;
  /** 涨跌幅（当日），-1~1 */
  changeRate: number;
  /** 币种 */
  currency: "CNY" | "USD" | "HKD";
  /** 报价时间 ISO */
  quotedAt: string;
  /** 数据源标识（mock / tushare / eastmoney ...） */
  provider: string;
  /** 是否为模拟数据 */
  simulated: boolean;
}

/** 历史价格点 */
export interface HistoryPoint {
  /** yyyy-mm-dd */
  date: string;
  price: number;
}

/** 组合持仓条目（Provider 侧账户视角，可选能力） */
export interface ProviderPosition {
  code: string;
  name: string;
  shares: number;
  cost: number;
  price: number;
  marketValue: number;
}

/** 股票数据 Provider 接口 */
export interface StockProvider {
  /** Provider 标识 */
  readonly id: string;
  /** 是否为模拟数据源 */
  readonly simulated: boolean;
  /** 获取单只股票实时报价 */
  getQuote(code: string): Promise<Quote | null>;
  /** 批量报价 */
  getQuotes(codes: string[]): Promise<Quote[]>;
  /** 获取历史价格（近 N 天） */
  getHistory(code: string, days: number): Promise<HistoryPoint[]>;
  /** 获取账户组合（未绑定券商账户时返回 null） */
  getPortfolio(accountId?: string): Promise<ProviderPosition[] | null>;
}

/** 基金数据 Provider 接口 */
export interface FundProvider {
  readonly id: string;
  readonly simulated: boolean;
  /** 获取基金净值报价 */
  getQuote(code: string): Promise<Quote | null>;
  getQuotes(codes: string[]): Promise<Quote[]>;
  /** 获取历史净值 */
  getHistory(code: string, days: number): Promise<HistoryPoint[]>;
  /** 获取基金估值（盘中估算净值，可选能力） */
  getEstimate(code: string): Promise<Quote | null>;
}
