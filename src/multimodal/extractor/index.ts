import "server-only";

/**
 * Financial Extraction Agent（需求五）—— 从解析产物中提取金融实体。
 *  - 输入：RawRecord[]（结构化行）或纯文本（PDF / OCR 输出）；
 *  - 输出：StructuredFinancialData（交易 / 持仓 / 保单 / 收入项）；
 *  - 默认零 LLM：复用 financial-data 的 normalizer + classifier 规则引擎；
 *  - 工资单文本走专用规则（实发 / 应发 / 税后 关键词），中英文均支持。
 */

import {
  normalizeTransactions,
  normalizeHoldings,
  extractPolicyFromText,
} from "@/financial-data/normalizer";
import { classifyTransactions } from "@/financial-data/classifier";
import type { ImportSource, RawRecord } from "@/financial-data/types";
import type { ClassifiedTransaction } from "@/financial-data/classifier";
import {
  emptyStructuredData,
  type ExtractedIncome,
  type MultimodalDocKind,
  type StructuredFinancialData,
} from "../types";

export interface ExtractInput {
  kind: MultimodalDocKind;
  source: ImportSource;
  records: RawRecord[];
  text: string;
}

export interface ExtractOutput {
  data: StructuredFinancialData;
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/*  工资单文本规则                                                               */
/* -------------------------------------------------------------------------- */

const PAYSLIP_RULES: { label: string; re: RegExp }[] = [
  { label: "实发工资", re: /(?:实发|实发工资|实发金额|税后(?:工资|收入)?|net\s*pay|take[-\s]?home)[：:\s|]*[¥￥]?\s*([\d,]+(?:\.\d+)?)/i },
  { label: "应发工资", re: /(?:应发|应发工资|应发金额|税前(?:工资|收入)?|gross\s*(?:pay|salary))[：:\s|]*[¥￥]?\s*([\d,]+(?:\.\d+)?)/i },
  { label: "基本工资", re: /(?:基本工资|底薪|base\s*(?:pay|salary))[：:\s|]*[¥￥]?\s*([\d,]+(?:\.\d+)?)/i },
];

function parseMoney(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 从工资单文本抽取收入项（规则式，零 LLM） */
export function extractPayslipIncomes(text: string): ExtractedIncome[] {
  const incomes: ExtractedIncome[] = [];
  for (const rule of PAYSLIP_RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const amount = parseMoney(m[1]);
    if (amount == null) continue;
    incomes.push({
      label: rule.label,
      amount,
      period: "monthly",
      evidence: m[0].slice(0, 80),
    });
  }
  return incomes;
}

/** 用识别出的「实发工资」合成一条工资收入交易（进入现金流统计） */
function payslipToTransaction(
  incomes: ExtractedIncome[],
  source: ImportSource,
  text: string
): ClassifiedTransaction | null {
  const net =
    incomes.find((i) => i.label === "实发工资") ??
    incomes.find((i) => i.label === "应发工资");
  if (!net) return null;
  // 工资单日期：尽力从文本取 yyyy年mm月 / yyyy-mm，取不到用当月
  const dm =
    /(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*月?/.exec(text) ?? null;
  const now = new Date();
  const year = dm ? Number(dm[1]) : now.getFullYear();
  const month = dm ? Number(dm[2]) : now.getMonth() + 1;
  const date = `${year}-${String(Math.min(Math.max(month, 1), 12)).padStart(2, "0")}-15`;
  return {
    date,
    amount: net.amount,
    direction: "income",
    category: "salary",
    merchant: "工资单",
    description: `工资单识别：${net.label} ${net.amount}`,
    rawType: "收入",
    source,
    confidence: 0.9,
    classifiedBy: "rule",
  };
}

/* -------------------------------------------------------------------------- */
/*  主抽取入口                                                                   */
/* -------------------------------------------------------------------------- */

/** 从解析产物中提取金融实体（零 LLM 默认路径） */
export async function extractFinancialData(
  input: ExtractInput
): Promise<ExtractOutput> {
  const warnings: string[] = [];
  const data = emptyStructuredData();

  // ---- 1. 保险合同：纯文本抽取 ----
  if (input.kind === "insurance") {
    const { draft, warnings: pw } = extractPolicyFromText(
      input.text,
      input.source
    );
    warnings.push(...pw);
    if (draft) data.policies.push(draft);
  }

  // ---- 2. 持仓类：RawRecord → HoldingDraft ----
  if (
    input.records.length > 0 &&
    (input.kind === "holdings" ||
      input.kind === "investment-report" ||
      input.kind === "asset-sheet")
  ) {
    const { drafts, warnings: hw } = normalizeHoldings(
      input.records,
      input.source === "fund" ? "fund" : "stock"
    );
    warnings.push(...hw);
    data.holdings.push(...drafts);
  }

  // ---- 3. 交易类：RawRecord → 归一化 → 规则分类 ----
  if (
    input.records.length > 0 &&
    (input.kind === "bank-statement" ||
      input.kind === "expense" ||
      input.kind === "payslip" ||
      (input.kind === "unknown" && data.holdings.length === 0))
  ) {
    const { drafts, warnings: nw } = normalizeTransactions(
      input.records,
      input.source
    );
    warnings.push(...nw);
    if (drafts.length > 0) {
      const classified = await classifyTransactions(drafts);
      warnings.push(...classified.warnings);
      data.transactions.push(...classified.transactions);
    }
  }

  // ---- 4. 工资单：文本规则抽收入项 ----
  if (input.kind === "payslip" && input.text) {
    const incomes = extractPayslipIncomes(input.text);
    data.incomes.push(...incomes);
    // 无行记录时，用实发工资合成一条收入交易
    if (incomes.length > 0 && data.transactions.length === 0) {
      const tx = payslipToTransaction(incomes, input.source, input.text);
      if (tx) data.transactions.push(tx);
    }
  }

  // ---- 5. 统计 ----
  const monthlyIncome =
    data.incomes.find((i) => i.label === "实发工资")?.amount ??
    data.incomes[0]?.amount;
  const expenseTx = data.transactions.filter((t) => t.direction === "expense");
  const expenseMonths = new Set(expenseTx.map((t) => t.date.slice(0, 7))).size;
  const monthlyExpense =
    expenseMonths > 0
      ? Math.round(
          expenseTx.reduce((s, t) => s + Math.abs(t.amount), 0) / expenseMonths
        )
      : undefined;

  data.stats = {
    transactionCount: data.transactions.length,
    holdingCount: data.holdings.length,
    policyCount: data.policies.length,
    incomeCount: data.incomes.length,
    totalHoldingValue: Math.round(
      data.holdings.reduce((s, h) => s + h.marketValue, 0)
    ),
    monthlyIncome,
    monthlyExpense,
  };

  return { data, warnings };
}
