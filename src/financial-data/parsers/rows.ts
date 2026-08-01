/**
 * 二维表 → RawRecord[] 的共享映射逻辑。
 * CSV / XLSX 解析器统一复用，负责识别表头行与字段映射。
 * 纯函数，无第三方依赖，客户端 / 服务端共享。
 */

import type { RawRecord } from "../types";

/** 常见表头别名 → 标准字段映射 */
export const HEADER_ALIASES: Record<string, string[]> = {
  // gross 必须在 amount 之前：工资单「应发金额」不应被当作交易金额，
  // 实际到账应取「实发金额」（由 amount 的"金额"别名兜底命中）。
  gross: ["应发金额", "应发", "税前金额", "税前工资", "gross pay", "gross amount"],
  date: [
    "date",
    "交易日期",
    "交易时间",
    "日期",
    "记账日期",
    "入账日期",
    "交易日",
    "时间",
    "trans date",
    "transaction date",
    "posted date",
  ],
  description: [
    "description",
    "摘要",
    "交易摘要",
    "交易说明",
    "备注",
    "交易备注",
    "说明",
    "用途",
    "memo",
    "narrative",
    "detail",
    "交易类型",
  ],
  merchant: [
    "merchant",
    "商户",
    "商户名称",
    "对方户名",
    "对手方",
    "收款方",
    "付款方",
    "交易对方",
    "payee",
    "counterparty",
  ],
  amount: ["amount", "金额", "交易金额", "发生额", "money", "trans amount", "交易额"],
  rawType: [
    "type",
    "收支",
    "收/支",
    "借贷标志",
    "借贷",
    "方向",
    "收支类型",
    "dc flag",
    "debit/credit",
    "cr/dr",
  ],
  balance: ["balance", "余额", "账户余额", "可用余额", "bal"],
};

/** 归一化表头文案：去空格、小写 */
export function canon(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 将原始表头映射到标准字段名 */
export function buildHeaderMap(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  headers.forEach((raw, idx) => {
    const c = canon(raw);
    for (const [std, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => c === canon(a) || c.includes(canon(a)))) {
        if (!Object.values(map).includes(std)) {
          map[idx] = std;
        }
        break;
      }
    }
  });
  return map;
}

/**
 * 将二维表转为 RawRecord[]。
 * 会在前 15 行中挑选命中标准字段最多的行作为表头。
 */
export function rowsToRecords(rows: string[][]): {
  records: RawRecord[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const nonEmpty = rows.filter((r) => r.some((c) => (c ?? "").trim().length > 0));
  if (nonEmpty.length === 0) {
    return { records: [], warnings: ["表格为空"] };
  }

  let headerRow = 0;
  let bestScore = -1;
  const scanLimit = Math.min(15, nonEmpty.length);
  for (let i = 0; i < scanLimit; i++) {
    const map = buildHeaderMap(nonEmpty[i].map((c) => c ?? ""));
    const score = Object.keys(map).length;
    if (score > bestScore) {
      bestScore = score;
      headerRow = i;
    }
  }

  if (bestScore <= 0) {
    warnings.push("未识别到标准表头，按首行作为表头处理");
    headerRow = 0;
  }

  const headers = nonEmpty[headerRow].map((c) => (c ?? "").trim());
  const headerMap = buildHeaderMap(headers);
  // 仅当表头包含日期/金额列时才用「无日期且无金额」过滤行；
  // 持仓类表格（基金/股票）没有这两列，不能误删数据行。
  const hasTxColumns =
    Object.values(headerMap).includes("date") || Object.values(headerMap).includes("amount");

  const records: RawRecord[] = [];
  for (let i = headerRow + 1; i < nonEmpty.length; i++) {
    const cells = nonEmpty[i];
    if (cells.every((c) => (c ?? "").trim().length === 0)) continue;

    const fields: Record<string, string> = {};
    const rec: RawRecord = { fields, rowIndex: i + 1 };
    headers.forEach((h, idx) => {
      const value = (cells[idx] ?? "").trim();
      fields[h || `col${idx}`] = value;
      const std = headerMap[idx];
      if (std && value) {
        (rec as unknown as Record<string, unknown>)[std] = value;
      }
    });

    if (hasTxColumns && !rec.amount && !rec.date) continue;
    records.push(rec);
  }

  if (records.length === 0) {
    warnings.push("未解析到任何有效记录");
  }
  return { records, warnings };
}
