import "server-only";

/**
 * Data Validator（需求一 / 三第 5 步）—— 抽取结果验证与清洗。
 *  - 金额边界：交易 |amount| ≤ 1 亿，持仓市值 ≤ 100 亿（异常剔除并告警）；
 *  - 日期合法性：1990-01-01 ~ 当前年份+1；
 *  - 内部去重：同 date+amount+description 指纹只保留一条；
 *  - 输出 ValidationReport（error 级问题 → 整体 ok=false）。
 */

import type {
  StructuredFinancialData,
  ValidationIssue,
  ValidationReport,
} from "../types";

const MAX_TX_AMOUNT = 100_000_000; // 1 亿
const MAX_HOLDING_VALUE = 10_000_000_000; // 100 亿
const MIN_DATE = "1990-01-01";

function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (date < MIN_DATE) return false;
  const maxYear = new Date().getFullYear() + 1;
  return Number(date.slice(0, 4)) <= maxYear;
}

export interface ValidateOutput {
  cleaned: StructuredFinancialData;
  report: ValidationReport;
}

/** 验证并清洗抽取结果 */
export function validateExtracted(
  data: StructuredFinancialData
): ValidateOutput {
  const issues: ValidationIssue[] = [];
  let dropped = 0;

  // ---- 交易 ----
  const seen = new Set<string>();
  const transactions = data.transactions.filter((t) => {
    if (!isValidDate(t.date)) {
      dropped++;
      return false;
    }
    if (!Number.isFinite(t.amount) || Math.abs(t.amount) > MAX_TX_AMOUNT) {
      dropped++;
      return false;
    }
    const fp = `${t.date}|${t.amount}|${t.description}`;
    if (seen.has(fp)) {
      dropped++;
      return false;
    }
    seen.add(fp);
    return true;
  });
  if (transactions.length < data.transactions.length) {
    issues.push({
      level: "warning",
      message: `${data.transactions.length - transactions.length} 条交易因日期/金额异常或重复被剔除`,
    });
  }

  // ---- 持仓 ----
  const holdings = data.holdings.filter((h) => {
    if (
      !Number.isFinite(h.marketValue) ||
      h.marketValue <= 0 ||
      h.marketValue > MAX_HOLDING_VALUE
    ) {
      dropped++;
      return false;
    }
    return Boolean(h.name.trim());
  });
  if (holdings.length < data.holdings.length) {
    issues.push({
      level: "warning",
      message: `${data.holdings.length - holdings.length} 条持仓因市值异常被剔除`,
    });
  }

  // ---- 保单 ----
  const policies = data.policies.filter((p) => {
    if (p.premium != null && (p.premium < 0 || p.premium > MAX_TX_AMOUNT)) {
      dropped++;
      return false;
    }
    return true;
  });

  // ---- 收入项 ----
  const incomes = data.incomes.filter(
    (i) => Number.isFinite(i.amount) && i.amount > 0 && i.amount <= MAX_TX_AMOUNT
  );

  const isEmpty =
    transactions.length === 0 &&
    holdings.length === 0 &&
    policies.length === 0 &&
    incomes.length === 0;
  if (isEmpty) {
    issues.push({
      level: "error",
      message: "未能从资料中识别出任何有效金融数据",
    });
  }

  const cleaned: StructuredFinancialData = {
    transactions,
    holdings,
    policies,
    incomes,
    stats: {
      ...data.stats,
      transactionCount: transactions.length,
      holdingCount: holdings.length,
      policyCount: policies.length,
      incomeCount: incomes.length,
      totalHoldingValue: Math.round(
        holdings.reduce((s, h) => s + h.marketValue, 0)
      ),
    },
  };

  return {
    cleaned,
    report: {
      ok: !issues.some((i) => i.level === "error"),
      issues,
      droppedCount: dropped,
    },
  };
}
