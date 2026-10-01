"use client";

import { backendAuthedFetch } from "@/lib/enterprise-sync";

/**
 * 构造外部参考数据上下文（汇率 / LPR），随研判请求提供给模型。
 * 失败时返回 null（不阻塞不注入），全部为公开数据，需人工复核。
 */
export interface ExternalContext {
  fx?: { base: string; date: string; rates: Record<string, number> };
  lpr?: Record<string, unknown> | null;
  note: string;
}

export async function buildExternalContext(): Promise<ExternalContext | null> {
  try {
    const [fxResp, lprResp] = await Promise.all([
      backendAuthedFetch("/api/data-sources/fx/latest?base=USD&symbols=CNY,EUR,JPY,HKD,GBP"),
      backendAuthedFetch("/api/data-sources/akshare/lpr?limit=1"),
    ]);
    const fxPayload = await fxResp.json() as { data?: { rows?: Array<{ 目标货币?: string; 汇率?: number; 基准?: string; 日期?: string }> } };
    const lprPayload = await lprResp.json() as { data?: { rows?: Array<Record<string, unknown>> } };
    const rows = fxPayload.data?.rows ?? [];
    const rates: Record<string, number> = {};
    for (const row of rows) {
      if (row.目标货币 && typeof row.汇率 === "number") rates[row.目标货币] = row.汇率;
    }
    if (!Object.keys(rates).length) return null;
    return {
      fx: { base: rows[0]?.基准 ?? "USD", date: rows[0]?.日期 ?? "", rates },
      lpr: (lprPayload.data?.rows ?? [])[0] ?? null,
      note: "外部公开数据（ECB 汇率 / LPR），需人工复核；金额折算请注明所用汇率与日期",
    };
  } catch {
    return null;
  }
}
