/**
 * 证券元数据表 —— 已知代码的行业 / 地区映射（Portfolio Analyzer 用）。
 * 未命中时按持仓类别回退到通用分类。纯数据，客户端 / 服务端共享。
 */

import type { HoldingType } from "@/financial-data/types";

export interface SecurityMeta {
  /** 行业 */
  sector: string;
  /** 地区 */
  region: string;
}

/** 已知股票代码元数据（与 Mock Provider 名称表对齐） */
export const STOCK_META: Record<string, SecurityMeta> = {
  "600519": { sector: "消费", region: "中国A股" },
  "000858": { sector: "消费", region: "中国A股" },
  "000001": { sector: "金融", region: "中国A股" },
  "600036": { sector: "金融", region: "中国A股" },
  "601318": { sector: "金融", region: "中国A股" },
  "300750": { sector: "新能源", region: "中国A股" },
  "002594": { sector: "新能源汽车", region: "中国A股" },
  "601899": { sector: "资源材料", region: "中国A股" },
};

/** 已知基金代码元数据（与 Mock Provider 名称表对齐） */
export const FUND_META: Record<string, SecurityMeta> = {
  "110011": { sector: "成长混合", region: "中国A股" },
  "005827": { sector: "蓝筹混合", region: "中国A股" },
  "000961": { sector: "宽基指数", region: "中国A股" },
  "161725": { sector: "消费", region: "中国A股" },
  "519674": { sector: "科技成长", region: "中国A股" },
  "003096": { sector: "医疗健康", region: "中国A股" },
};

/** 按持仓类别的行业回退 */
const SECTOR_FALLBACK: Record<HoldingType, string> = {
  stock: "其他行业",
  fund: "综合基金",
  bond: "债券",
  cash: "现金",
  insurance: "保险",
  realestate: "房地产",
  crypto: "数字资产",
  other: "其他",
};

/** 按持仓类别的地区回退（默认按中国境内资产处理） */
const REGION_FALLBACK: Record<HoldingType, string> = {
  stock: "中国A股",
  fund: "中国A股",
  bond: "中国",
  cash: "中国",
  insurance: "中国",
  realestate: "中国",
  crypto: "全球",
  other: "中国",
};

/** 查询证券元数据（未命中回退到类别默认值） */
export function lookupSecurityMeta(type: HoldingType, code?: string): SecurityMeta {
  if (code) {
    const table = type === "stock" ? STOCK_META : type === "fund" ? FUND_META : null;
    const hit = table?.[code.trim()];
    if (hit) return hit;
  }
  return { sector: SECTOR_FALLBACK[type], region: REGION_FALLBACK[type] };
}
