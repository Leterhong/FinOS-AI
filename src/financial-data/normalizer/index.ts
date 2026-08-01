/**
 * Financial Normalizer —— 统一不同来源数据。
 * 银行A "salary" / 银行B "工资入账" → income_salary 等语义统一，
 * 由 classifier 完成分类，本层负责结构归一：
 *   RawRecord[] → 交易骨架（日期 / 金额 / 方向统一）
 *   RawRecord[] → AssetHolding[]（基金 / 股票持仓）
 *   PDF 文本 → InsurancePolicy（保险合同字段抽取）
 * 纯函数，客户端 / 服务端共享。
 */

import type {
  AssetHolding,
  HoldingType,
  ImportSource,
  InsurancePolicy,
  RawRecord,
  TransactionDirection,
} from "../types";
import { parseDate } from "./date";
import { parseAmount, directionFromRawType } from "./amount";

/* -------------------------------------------------------------------------- */
/*  交易骨架（未分类）                                                            */
/* -------------------------------------------------------------------------- */

/** 归一化后的交易骨架，尚未分类（category 由 classifier 填充） */
export interface TransactionDraft {
  date: string;
  /** 正=收入，负=支出 */
  amount: number;
  direction: TransactionDirection;
  merchant: string;
  description: string;
  rawType: string;
  source: ImportSource;
  rowIndex: number;
}

/** 将 RawRecord[] 归一化为交易骨架 */
export function normalizeTransactions(
  records: RawRecord[],
  source: ImportSource,
): { drafts: TransactionDraft[]; warnings: string[] } {
  const drafts: TransactionDraft[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const rec of records) {
    const date = parseDate(rec.date);
    const rawAmount = parseAmount(rec.amount);
    if (!date || rawAmount == null || rawAmount === 0) {
      skipped++;
      continue;
    }

    // 方向判定优先级：rawType 文案 > 金额符号 > 来源默认
    const typeDir = directionFromRawType(rec.rawType);
    let direction: TransactionDirection;
    let amount: number;

    if (typeDir === "income") {
      direction = "income";
      amount = Math.abs(rawAmount);
    } else if (typeDir === "expense") {
      direction = "expense";
      amount = -Math.abs(rawAmount);
    } else if (rawAmount < 0) {
      direction = "expense";
      amount = rawAmount;
    } else if (source === "credit-card") {
      // 信用卡账单默认正数为消费
      direction = "expense";
      amount = -Math.abs(rawAmount);
    } else if (source === "salary") {
      direction = "income";
      amount = Math.abs(rawAmount);
    } else {
      direction = "income";
      amount = rawAmount;
    }

    drafts.push({
      date,
      amount,
      direction,
      merchant: (rec.merchant ?? "").trim(),
      description: (rec.description ?? "").trim(),
      rawType: (rec.rawType ?? "").trim(),
      source,
      rowIndex: rec.rowIndex,
    });
  }

  if (skipped > 0) {
    warnings.push(`${skipped} 条记录因日期或金额无法解析被跳过`);
  }
  return { drafts, warnings };
}

/* -------------------------------------------------------------------------- */
/*  持仓归一化（基金 / 股票）                                                     */
/* -------------------------------------------------------------------------- */

const HOLDING_FIELD_ALIASES: Record<string, string[]> = {
  name: ["名称", "基金名称", "股票名称", "证券名称", "产品名称", "name", "fund name", "stock name"],
  code: ["代码", "基金代码", "股票代码", "证券代码", "code", "symbol", "ticker"],
  shares: ["份额", "持有份额", "持仓份额", "股数", "持股数", "数量", "shares", "quantity", "qty"],
  cost: ["成本价", "单位成本", "买入均价", "持仓成本价", "cost", "avg cost", "unit cost"],
  price: ["净值", "单位净值", "现价", "最新价", "市价", "price", "nav", "last price"],
  marketValue: ["市值", "持仓市值", "总市值", "资产市值", "market value", "value"],
  totalCost: ["成本", "持仓成本", "总成本", "买入金额", "total cost", "cost basis"],
  profit: ["盈亏", "浮动盈亏", "持有收益", "累计收益", "profit", "pnl", "gain/loss"],
  returnRate: ["收益率", "持有收益率", "涨跌幅", "return", "return rate", "yield"],
};

function pickField(rec: RawRecord, key: string): string | undefined {
  const aliases = HOLDING_FIELD_ALIASES[key] ?? [];
  for (const [k, v] of Object.entries(rec.fields)) {
    const ck = k.trim().toLowerCase();
    if (aliases.some((a) => ck === a.toLowerCase() || ck.includes(a.toLowerCase()))) {
      if (v) return v;
    }
  }
  return undefined;
}

/** 持仓骨架（未含 id / userId / importId，由 storage 层补全） */
export type HoldingDraft = Omit<AssetHolding, "id" | "userId" | "importId">;

/** 将 RawRecord[] 归一化为持仓骨架 */
export function normalizeHoldings(
  records: RawRecord[],
  source: ImportSource,
): { drafts: HoldingDraft[]; warnings: string[] } {
  const type: HoldingType = source === "fund" ? "fund" : source === "stock" ? "stock" : "other";
  const drafts: HoldingDraft[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const rec of records) {
    const name = pickField(rec, "name") ?? rec.description ?? rec.merchant ?? "";
    const marketValueRaw = pickField(rec, "marketValue") ?? rec.amount;
    const marketValue = parseAmount(marketValueRaw);
    if (!name.trim() || marketValue == null || marketValue <= 0) {
      skipped++;
      continue;
    }

    const shares = parseAmount(pickField(rec, "shares")) ?? undefined;
    const cost = parseAmount(pickField(rec, "cost")) ?? undefined;
    const price = parseAmount(pickField(rec, "price")) ?? undefined;
    const totalCost =
      parseAmount(pickField(rec, "totalCost")) ??
      (shares != null && cost != null ? Number((shares * cost).toFixed(2)) : undefined);
    let profit = parseAmount(pickField(rec, "profit")) ?? undefined;
    if (profit == null && totalCost != null) {
      profit = Number((marketValue - totalCost).toFixed(2));
    }
    let returnRate: number | undefined;
    const rrRaw = pickField(rec, "returnRate");
    if (rrRaw != null) {
      const rr = parseAmount(rrRaw.replace(/%/g, ""));
      if (rr != null) returnRate = rrRaw.includes("%") || Math.abs(rr) > 1 ? rr / 100 : rr;
    } else if (profit != null && totalCost != null && totalCost > 0) {
      returnRate = Number((profit / totalCost).toFixed(4));
    }

    drafts.push({
      name: name.trim(),
      code: pickField(rec, "code")?.trim(),
      type,
      shares,
      cost,
      price,
      marketValue,
      totalCost,
      profit,
      returnRate,
      source,
    });
  }

  if (skipped > 0) {
    warnings.push(`${skipped} 条持仓记录因名称或市值缺失被跳过`);
  }
  return { drafts, warnings };
}

/* -------------------------------------------------------------------------- */
/*  保险合同字段抽取（PDF 文本）                                                  */
/* -------------------------------------------------------------------------- */

/** 保险骨架 */
export type PolicyDraft = Omit<InsurancePolicy, "id" | "userId" | "importId">;

/** 从保险合同纯文本中抽取关键字段（规则式，尽力而为） */
export function extractPolicyFromText(
  text: string,
  source: ImportSource,
): { draft: PolicyDraft | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!text.trim()) {
    return { draft: null, warnings: ["保险合同文本为空"] };
  }

  const pick = (patterns: RegExp[]): string | undefined => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return undefined;
  };

  const pickNumber = (patterns: RegExp[]): number | undefined => {
    const s = pick(patterns);
    if (!s) return undefined;
    let n = parseAmount(s.replace(/万元|万/g, ""));
    if (n == null) return undefined;
    if (/万/.test(s)) n *= 10000;
    return n;
  };

  const insurer =
    pick([/保险人[:：]\s*([^\s，,。;；\n]{2,30})/, /承保公司[:：]\s*([^\s，,。;；\n]{2,30})/, /([^\s，,。;；\n]{2,20}保险(?:股份)?有限公司)/]) ?? "未知保险公司";

  const productName =
    pick([/产品名称[:：]\s*([^\s，,。;；\n]{2,40})/, /险种名称[:：]\s*([^\s，,。;；\n]{2,40})/, /《([^》]{2,40})》/]) ?? "未知产品";

  const policyType =
    pick([/险种(?:类别|类型)?[:：]\s*([^\s，,。;；\n]{2,20})/]) ??
    (text.includes("重大疾病") || text.includes("重疾")
      ? "重疾险"
      : text.includes("医疗")
        ? "医疗险"
        : text.includes("意外")
          ? "意外险"
          : text.includes("年金")
            ? "年金险"
            : text.includes("寿险") || text.includes("身故")
              ? "寿险"
              : "其他");

  const coverage = pickNumber([
    /(?:基本)?保(?:险金)?额[:：]?\s*(?:人民币)?\s*([\d,.]+\s*万?元?)/,
    /保险金额[:：]?\s*(?:人民币)?\s*([\d,.]+\s*万?元?)/,
  ]);

  const premium = pickNumber([
    /(?:年交|年缴|每年)保费[:：]?\s*(?:人民币)?\s*([\d,.]+\s*万?元?)/,
    /保险费[:：]?\s*(?:人民币)?\s*([\d,.]+\s*万?元?)/,
    /保费[:：]?\s*(?:人民币)?\s*([\d,.]+\s*万?元?)/,
  ]);

  const paymentYearsStr = pick([/(?:交费|缴费)(?:期间|年限|期)[:：]?\s*(\d{1,2})\s*年/]);
  const paymentYears = paymentYearsStr ? Number(paymentYearsStr) : undefined;

  const term = pick([/保(?:险|障)期(?:间|限)[:：]?\s*([^\s，,。;；\n]{2,20})/]);

  if (insurer === "未知保险公司" && productName === "未知产品" && !coverage && !premium) {
    warnings.push("未能从合同文本中抽取到有效保险字段");
    return { draft: null, warnings };
  }

  return {
    draft: { insurer, productName, policyType, coverage, premium, paymentYears, term, source },
    warnings,
  };
}

export { parseDate, monthOf } from "./date";
export { parseAmount, directionFromRawType } from "./amount";
