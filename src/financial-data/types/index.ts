/**
 * Phase 6 · Real Financial Data OS —— 数据层核心类型
 *
 * 纯数据类型，客户端 / 服务端共享，禁止引入 server-only。
 * 用户隔离统一通过 userId 字段贯穿。
 */

/* -------------------------------------------------------------------------- */
/*  导入来源                                                                    */
/* -------------------------------------------------------------------------- */

/** 支持导入的金融数据来源 */
export type ImportSource =
  | "bank-csv" // 银行流水 CSV
  | "credit-card" // 信用卡账单
  | "fund" // 基金持仓文件
  | "stock" // 股票持仓文件
  | "salary" // 工资 / 收入记录
  | "insurance-pdf" // 保险合同 PDF
  | "manual" // 手动添加（表单录入）
  | "api"; // 外部 API 同步（股票 / 基金行情 Provider）

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  "bank-csv": "银行流水",
  "credit-card": "信用卡账单",
  fund: "基金持仓",
  stock: "股票持仓",
  salary: "工资收入",
  "insurance-pdf": "保险合同",
  manual: "手动添加",
  api: "API 同步",
};

/** 支持解析的文件格式 */
export type FileFormat = "csv" | "xlsx" | "xls" | "pdf" | "json" | "txt";

/* -------------------------------------------------------------------------- */
/*  交易分类                                                                    */
/* -------------------------------------------------------------------------- */

/** 交易分类（消费 / 收入 / 投资 / 负债 等） */
export type TransactionCategory =
  | "dining" // 餐饮
  | "transport" // 交通
  | "shopping" // 购物
  | "rent" // 房租 / 房贷
  | "utilities" // 水电煤 / 生活缴费
  | "entertainment" // 娱乐
  | "medical" // 医疗
  | "education" // 教育
  | "salary" // 工资
  | "bonus" // 奖金 / 额外收入
  | "investment" // 投资 / 理财
  | "insurance" // 保险
  | "loan" // 贷款 / 还款
  | "transfer" // 转账
  | "other"; // 其他 / 未识别

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  dining: "餐饮",
  transport: "交通",
  shopping: "购物",
  rent: "房租房贷",
  utilities: "生活缴费",
  entertainment: "娱乐",
  medical: "医疗",
  education: "教育",
  salary: "工资",
  bonus: "奖金",
  investment: "投资理财",
  insurance: "保险",
  loan: "贷款还款",
  transfer: "转账",
  other: "其他",
};

/** 交易方向 */
export type TransactionDirection = "income" | "expense" | "transfer";

/** 收入类分类集合（用于现金流拆分） */
export const INCOME_CATEGORIES: TransactionCategory[] = ["salary", "bonus"];

/** 支出类分类集合 */
export const EXPENSE_CATEGORIES: TransactionCategory[] = [
  "dining",
  "transport",
  "shopping",
  "rent",
  "utilities",
  "entertainment",
  "medical",
  "education",
  "insurance",
  "loan",
];

/* -------------------------------------------------------------------------- */
/*  原始记录（解析器输出）                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 解析器从原始文件抽取的一行原始记录。
 * 字段尽量保真，不做语义归一化，归一化交给 Normalizer。
 */
export interface RawRecord {
  /** 原始日期字符串（保留原文，供 normalizer 解析） */
  date?: string;
  /** 交易描述 / 摘要 / 对手方 */
  description?: string;
  /** 商户名 */
  merchant?: string;
  /** 金额（可能带正负号或币种符号，字符串保真） */
  amount?: string;
  /** 收 / 支 / 借 / 贷 等原始类型文案 */
  rawType?: string;
  /** 余额（银行流水常见） */
  balance?: string;
  /** 原始整行键值对，未映射字段全部保留 */
  fields: Record<string, string>;
  /** 原始行号（1-based，便于溯源） */
  rowIndex: number;
}

/* -------------------------------------------------------------------------- */
/*  归一化交易                                                                   */
/* -------------------------------------------------------------------------- */

/** 归一化后的标准交易（Normalizer + Classifier 输出） */
export interface NormalizedTransaction {
  /** 交易唯一 id */
  id: string;
  /** 归属用户 */
  userId: string;
  /** ISO 日期 yyyy-mm-dd */
  date: string;
  /** 金额，正数=收入，负数=支出（统一 CNY） */
  amount: number;
  /** 交易方向 */
  direction: TransactionDirection;
  /** 分类 */
  category: TransactionCategory;
  /** 商户 / 对手方 */
  merchant: string;
  /** 原始描述 */
  description: string;
  /** 归一化前的原始类型文案 */
  rawType: string;
  /** 数据来源 */
  source: ImportSource;
  /** 分类置信度 0~1 */
  confidence: number;
  /** 分类方式：rule=规则命中，llm=模型推断，manual=人工 */
  classifiedBy: "rule" | "llm" | "manual";
  /** 关联导入批次 id */
  importId: string;
}

/* -------------------------------------------------------------------------- */
/*  资产持仓                                                                     */
/* -------------------------------------------------------------------------- */

/** 持仓类别 */
export type HoldingType =
  | "fund" // 基金
  | "stock" // 股票
  | "bond" // 债券
  | "cash" // 现金 / 存款
  | "insurance" // 保险
  | "realestate" // 房产
  | "crypto" // 数字资产
  | "other";

export const HOLDING_TYPE_LABELS: Record<HoldingType, string> = {
  fund: "基金",
  stock: "股票",
  bond: "债券",
  cash: "现金存款",
  insurance: "保险",
  realestate: "房产",
  crypto: "数字资产",
  other: "其他",
};

/** 资产持仓（基金 / 股票 / 保险 等） */
export interface AssetHolding {
  id: string;
  userId: string;
  /** 持仓名称，如「易方达蓝筹精选」 */
  name: string;
  /** 代码，如基金代码 / 股票代码 */
  code?: string;
  /** 持仓类别 */
  type: HoldingType;
  /** 持有份额 / 股数 */
  shares?: number;
  /** 单位成本 */
  cost?: number;
  /** 当前单位净值 / 价格 */
  price?: number;
  /** 当前市值（CNY） */
  marketValue: number;
  /** 累计成本（CNY） */
  totalCost?: number;
  /** 浮动盈亏（CNY） */
  profit?: number;
  /** 收益率 0~1（可为负） */
  returnRate?: number;
  /** 数据来源 */
  source: ImportSource;
  /** 关联导入批次 id */
  importId: string;
}

/** 手动添加 / 编辑资产的表单入参（服务端补全 id / userId / source） */
export interface ManualAssetInput {
  /** 资产名称，如「招行活期」「贵州茅台」 */
  name: string;
  /** 资产类型 */
  type: HoldingType;
  /** 代码（股票 / 基金可选） */
  code?: string;
  /** 持有份额 / 股数 */
  shares?: number;
  /** 单位成本 */
  cost?: number;
  /** 当前市值（CNY，必填） */
  marketValue: number;
  /** 累计成本（CNY，可选；填了自动算盈亏） */
  totalCost?: number;
}

/* -------------------------------------------------------------------------- */
/*  保险合同                                                                     */
/* -------------------------------------------------------------------------- */

/** 保险合同（PDF 解析结果） */
export interface InsurancePolicy {
  id: string;
  userId: string;
  /** 保险公司 */
  insurer: string;
  /** 产品名称 */
  productName: string;
  /** 险种：寿险 / 重疾 / 医疗 / 意外 / 年金 等 */
  policyType: string;
  /** 保额（CNY） */
  coverage?: number;
  /** 年缴保费（CNY） */
  premium?: number;
  /** 缴费年限 */
  paymentYears?: number;
  /** 保障期限描述 */
  term?: string;
  source: ImportSource;
  importId: string;
}

/* -------------------------------------------------------------------------- */
/*  解析数据集                                                                   */
/* -------------------------------------------------------------------------- */

/** 解析器 / 归一化后的完整数据集 */
export interface ParsedDataset {
  transactions: NormalizedTransaction[];
  holdings: AssetHolding[];
  policies: InsurancePolicy[];
  meta: DatasetMeta;
}

/** 数据集元信息 */
export interface DatasetMeta {
  source: ImportSource;
  format: FileFormat;
  fileName: string;
  /** 原始记录数 */
  rowCount: number;
  /** 成功解析数 */
  parsedCount: number;
  /** 解析失败 / 跳过数 */
  skippedCount: number;
  /** 数据时间范围 */
  dateRange?: { from: string; to: string };
  /** 解析告警信息 */
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/*  导入批次                                                                     */
/* -------------------------------------------------------------------------- */

/** 一次导入操作的记录 */
export interface ImportBatch {
  id: string;
  userId: string;
  source: ImportSource;
  fileName: string;
  format: FileFormat;
  /** 导入时间 ISO */
  importedAt: string;
  transactionCount: number;
  holdingCount: number;
  policyCount: number;
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/*  个人金融档案（数据库聚合视图）                                                 */
/* -------------------------------------------------------------------------- */

/**
 * 每用户独立的金融数据档案，作为 Personal Finance Database 的聚合快照。
 * 由 storage 层持久化（加密），供 Twin Builder / Agent 消费。
 */
export interface PersonalFinanceRecord {
  userId: string;
  transactions: NormalizedTransaction[];
  holdings: AssetHolding[];
  policies: InsurancePolicy[];
  imports: ImportBatch[];
  /** 最近一次数据更新时间 ISO */
  updatedAt: string;
  /** 记录版本号 */
  version: number;
}

/* -------------------------------------------------------------------------- */
/*  加密载体                                                                     */
/* -------------------------------------------------------------------------- */

/** AES-256-GCM 加密后的存储载体 */
export interface EncryptedBlob {
  /** 加密算法标识 */
  alg: "aes-256-gcm";
  /** base64 初始向量 */
  iv: string;
  /** base64 认证标签 */
  tag: string;
  /** base64 密文 */
  data: string;
  /** 写入时间 ISO */
  savedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  数据统计摘要（Dashboard / Agent 消费）                                        */
/* -------------------------------------------------------------------------- */

/** 单分类消费统计 */
export interface CategoryStat {
  category: TransactionCategory;
  label: string;
  amount: number;
  count: number;
  /** 占总支出比例 0~1 */
  ratio: number;
}

/** 月度现金流点 */
export interface MonthlyCashFlowPoint {
  /** yyyy-mm */
  month: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
}

/** 资产配置项 */
export interface AssetAllocationSlice {
  type: HoldingType;
  label: string;
  value: number;
  ratio: number;
}

/** 完整财务数据摘要 */
export interface FinancialDataSummary {
  userId: string;
  /** 数据是否存在 */
  hasData: boolean;
  updatedAt: string | null;
  /** 交易总数 */
  transactionCount: number;
  /** 统计区间 */
  dateRange: { from: string; to: string } | null;
  /** 月均收入 */
  avgMonthlyIncome: number;
  /** 月均支出 */
  avgMonthlyExpense: number;
  /** 平均储蓄率 0~1 */
  avgSavingsRate: number;
  /** 总资产（持仓市值 + 现金） */
  totalAssets: number;
  /** 总市值（投资类） */
  totalInvestment: number;
  /** 投资总盈亏 */
  totalProfit: number;
  /** 按分类的支出统计 */
  categoryStats: CategoryStat[];
  /** 月度现金流 */
  monthlyCashFlow: MonthlyCashFlowPoint[];
  /** 资产配置 */
  assetAllocation: AssetAllocationSlice[];
  /** 导入批次概览 */
  imports: ImportBatch[];
}

/* -------------------------------------------------------------------------- */
/*  数据洞察                                                                     */
/* -------------------------------------------------------------------------- */

/** 数据洞察级别 */
export type InsightLevel = "info" | "positive" | "warning" | "critical";

/** Data Insight Agent 产出的单条洞察 */
export interface FinancialInsight {
  id: string;
  level: InsightLevel;
  /** 洞察标题，如「过去 6 个月餐饮消费增长 35%」 */
  title: string;
  /** 洞察详情 */
  detail: string;
  /** 关联分类（可选） */
  category?: TransactionCategory;
  /** 支撑指标（如变化百分比） */
  metric?: number;
  /** 来源：rule=统计规则，llm=模型 */
  source: "rule" | "llm";
}

/* -------------------------------------------------------------------------- */
/*  导入请求 / 响应                                                              */
/* -------------------------------------------------------------------------- */

/** 导入请求（API 入参） */
export interface ImportRequest {
  userId: string;
  source: ImportSource;
  fileName: string;
  /** 文件内容：文本或 base64（二进制格式如 xlsx/pdf） */
  content: string;
  /** 内容编码 */
  encoding: "utf8" | "base64";
}

/** 导入响应 */
export interface ImportResult {
  ok: boolean;
  batch?: ImportBatch;
  meta?: DatasetMeta;
  summary?: FinancialDataSummary;
  error?: string;
}
