/**
 * Phase 6.7 · Multimodal Financial Intelligence —— 核心类型
 *
 * 纯类型定义，客户端 / 服务端共享，禁止引入 server-only。
 * 语义：一份用户上传的财务资料 → 一条 DocumentAnalysis（AI 理解结果），
 * 状态机：processing → needs_confirm →（用户确认）→ confirmed；失败 → failed。
 * AI 识别结果绝不直接写入财富画像，必须经用户确认（human-in-the-loop）。
 */

import type { ImportSource } from "@/financial-data/types";
import type { ClassifiedTransaction } from "@/financial-data/classifier";
import type { HoldingDraft, PolicyDraft } from "@/financial-data/normalizer";

/* -------------------------------------------------------------------------- */
/*  文档类型识别                                                                 */
/* -------------------------------------------------------------------------- */

/** 财务资料业务类型（Document Type Recognition 输出） */
export type MultimodalDocKind =
  | "payslip" // 工资单
  | "bank-statement" // 银行流水
  | "insurance" // 保险合同
  | "holdings" // 股票 / 基金持仓（表格或截图）
  | "asset-sheet" // 资产表
  | "expense" // 消费账单 / 信用卡账单
  | "investment-report" // 投资报告
  | "unknown";

export const DOC_KIND_LABELS: Record<MultimodalDocKind, string> = {
  payslip: "工资单",
  "bank-statement": "银行流水",
  insurance: "保险合同",
  holdings: "投资持仓",
  "asset-sheet": "资产表",
  expense: "消费账单",
  "investment-report": "投资报告",
  unknown: "未识别类型",
};

/** 文档类型 → 导入管线数据源的映射 */
export const KIND_TO_SOURCE: Record<MultimodalDocKind, ImportSource> = {
  payslip: "salary",
  "bank-statement": "bank-csv",
  insurance: "insurance-pdf",
  holdings: "stock",
  "asset-sheet": "manual",
  expense: "credit-card",
  "investment-report": "fund",
  unknown: "manual",
};

/* -------------------------------------------------------------------------- */
/*  分析状态机                                                                   */
/* -------------------------------------------------------------------------- */

/** 文档分析状态 */
export type AnalysisStatus =
  | "processing" // 处理中
  | "needs_confirm" // AI 已识别，等待用户确认
  | "confirmed" // 用户已确认，数据已写入财富画像
  | "failed"; // 解析 / 识别失败

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  processing: "处理中",
  needs_confirm: "需要确认",
  confirmed: "已完成",
  failed: "识别失败",
};

/* -------------------------------------------------------------------------- */
/*  结构化金融数据（Financial Extraction Agent 输出）                             */
/* -------------------------------------------------------------------------- */

/** 识别出的收入项（工资单等） */
export interface ExtractedIncome {
  /** 项目名，如「实发工资」 */
  label: string;
  /** 金额（CNY） */
  amount: number;
  /** 周期 */
  period: "monthly" | "yearly" | "once";
  /** 原文证据片段 */
  evidence?: string;
}

/** 抽取结果统计（前端确认界面展示用） */
export interface ExtractionStats {
  transactionCount: number;
  holdingCount: number;
  policyCount: number;
  incomeCount: number;
  /** 持仓总市值（CNY） */
  totalHoldingValue: number;
  /** 识别出的月收入（工资单） */
  monthlyIncome?: number;
  /** 识别出的月均支出（流水 / 账单） */
  monthlyExpense?: number;
}

/** Structured Financial Data —— AI 从资料中理解出的全部金融实体 */
export interface StructuredFinancialData {
  transactions: ClassifiedTransaction[];
  holdings: HoldingDraft[];
  policies: PolicyDraft[];
  incomes: ExtractedIncome[];
  stats: ExtractionStats;
}

/** 空结构化数据 */
export function emptyStructuredData(): StructuredFinancialData {
  return {
    transactions: [],
    holdings: [],
    policies: [],
    incomes: [],
    stats: {
      transactionCount: 0,
      holdingCount: 0,
      policyCount: 0,
      incomeCount: 0,
      totalHoldingValue: 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  数据验证                                                                     */
/* -------------------------------------------------------------------------- */

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  /** 被剔除的异常记录数 */
  droppedCount: number;
}

/* -------------------------------------------------------------------------- */
/*  文档分析记录（落盘实体）                                                       */
/* -------------------------------------------------------------------------- */

/** 一次文档 AI 理解的完整记录（与 DocumentMeta 一一对应） */
export interface DocumentAnalysis {
  id: string;
  userId: string;
  /** 关联的 documentStorage 文档 id */
  docId: string;
  fileName: string;
  mimeType: string;
  /** 文件内容 sha256 —— Document Hash 去重（同文件只分析一次） */
  hash: string;
  kind: MultimodalDocKind;
  source: ImportSource;
  status: AnalysisStatus;
  /** 是否使用了 OCR（图片文字识别） */
  ocrUsed: boolean;
  /** 是否使用了 Vision 模型 */
  visionUsed: boolean;
  extracted: StructuredFinancialData;
  validation: ValidationReport;
  warnings: string[];
  /** 数据可信度评分（0~100，需求九）：根据解析路径给出，<80 表示结果需谨慎确认 */
  confidence?: number;
  /** 失败原因（status=failed 时） */
  error?: string;
  /** 解析文本预览（前 400 字，确认界面溯源用） */
  textPreview?: string;
  createdAt: string;
  updatedAt: string;
  /** 用户确认写入画像的时间 */
  appliedAt?: string;
}

/* -------------------------------------------------------------------------- */
/*  Pipeline 输入 / 输出                                                        */
/* -------------------------------------------------------------------------- */

export interface AnalyzeInput {
  userId: string;
  docId: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
  /** 跳过 Document Hash 缓存，强制重新分析 */
  force?: boolean;
}

export interface AnalyzeResult {
  analysis: DocumentAnalysis;
  /** 是否命中 Document Hash 缓存（未重新消耗 AI） */
  cached: boolean;
}
