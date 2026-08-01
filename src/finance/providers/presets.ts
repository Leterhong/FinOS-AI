/**
 * 金融数据源预设（客户端 / 服务端共享）。
 * 内置源提供公开免费行情作为可选项；custom 允许用户接入任意自建 / 商业数据源。
 * 注意：系统「不默认绑定」任何数据源 —— 用户不配置则没有行情（绝不伪造，需求十四）。
 */

import type { FinanceProviderKind, ProviderCapabilities } from "../types";

export interface FinanceProviderPreset {
  kind: FinanceProviderKind;
  label: string;
  description: string;
  /** 默认 API 地址（custom 无默认，必须用户填写） */
  defaultBaseUrl?: string;
  /** 是否需要 API Key */
  needsKey: boolean;
  capabilities: ProviderCapabilities;
}

export const FINANCE_PROVIDER_PRESETS: FinanceProviderPreset[] = [
  {
    kind: "tencent-quote",
    label: "腾讯行情（公开接口）",
    description: "A股 / 港股 / 美股实时报价、指数与历史K线，公开接口免 API Key。",
    defaultBaseUrl: "https://qt.gtimg.cn",
    needsKey: false,
    capabilities: { stock: true, fund: false, index: true, history: true, news: false },
  },
  {
    kind: "eastmoney-fund",
    label: "天天基金净值（公开接口）",
    description: "公募基金单位净值与估值涨跌，公开接口免 API Key。",
    defaultBaseUrl: "https://fundgz.1234567.com.cn",
    needsKey: false,
    capabilities: { stock: false, fund: true, index: false, history: false, news: false },
  },
  {
    kind: "custom",
    label: "自定义数据源",
    description:
      "接入你自己的行情服务（REST JSON）：GET {base}/stock?symbols= | /fund?codes= | /index?codes= | /history?symbol=&days= | /news?symbols=&limit=，鉴权 Authorization: Bearer <API Key>。",
    needsKey: true,
    capabilities: { stock: true, fund: true, index: true, history: true, news: true },
  },
];

export function getFinancePreset(kind: FinanceProviderKind): FinanceProviderPreset {
  return (
    FINANCE_PROVIDER_PRESETS.find((p) => p.kind === kind) ??
    FINANCE_PROVIDER_PRESETS[FINANCE_PROVIDER_PRESETS.length - 1]
  );
}
