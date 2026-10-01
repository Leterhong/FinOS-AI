/**
 * 行业阈值分组：为规则模板提供差异化的指标阈值（非业务数据，仅规则口径）。
 *
 * 阈值仅用于风险提示，不替代授信政策或行业研究；用户启用模板后可在规则库中继续编辑。
 */

export interface ThresholdRule {
  metric: string;
  op: "lt" | "lte" | "gt" | "gte" | "eq";
  value: number;
  /** 口径说明与单位。 */
  note: string;
}

export interface IndustryProfile {
  id: string;
  label: string;
  description: string;
  rules: ThresholdRule[];
}

const LEVERAGE = (value: number, note: string): ThresholdRule => ({ metric: "资产负债率", op: "gt", value, note });
const CURRENT = (value: number): ThresholdRule => ({ metric: "流动比率", op: "lt", value, note: "倍；流动资产 / 流动负债" });
const QUICK = (value: number): ThresholdRule => ({ metric: "速动比率", op: "lt", value, note: "倍；(流动资产 - 存货) / 流动负债" });
const NET_MARGIN = (value: number): ThresholdRule => ({ metric: "净利率", op: "lt", value, note: "%；净利润 / 营业收入" });
const AR_TURNOVER = (value: number): ThresholdRule => ({ metric: "应收账款周转率", op: "lt", value, note: "倍；营业收入 / 平均应收账款" });
const CASH_COVER = (value: number): ThresholdRule => ({ metric: "经营现金流/流动负债", op: "lt", value, note: "%；经营活动现金流量净额 / 流动负债" });
const CONCENTRATION = (value: number): ThresholdRule => ({ metric: "客户集中度", op: "gt", value, note: "%；前五大客户收入占比" });
const INTEREST_COVER = (value: number): ThresholdRule => ({ metric: "利息保障倍数", op: "lt", value, note: "倍；息税前利润 / 利息费用" });

export const INDUSTRY_PROFILES: IndustryProfile[] = [
  {
    id: "general",
    label: "通用",
    description: "跨行业的通用风险提示阈值。",
    rules: [
      LEVERAGE(70, "%；负债合计 / 资产总计，通用高位提示"),
      CURRENT(1),
      NET_MARGIN(0),
      AR_TURNOVER(2),
      CASH_COVER(20),
      INTEREST_COVER(2),
    ],
  },
  {
    id: "manufacturing",
    label: "制造业",
    description: "重资产、存货与应收占比高，关注短债与周转。",
    rules: [
      LEVERAGE(65, "%；制造业高杠杆提示"),
      CURRENT(1.2),
      QUICK(0.8),
      NET_MARGIN(3),
      AR_TURNOVER(3),
      CASH_COVER(25),
      CONCENTRATION(60),
    ],
  },
  {
    id: "trading",
    label: "批发零售 / 贸易",
    description: "低毛利、高周转，关注毛利与应收、存货周转。",
    rules: [
      LEVERAGE(75, "%；贸易类高杠杆提示"),
      CURRENT(1),
      NET_MARGIN(1.5),
      AR_TURNOVER(4),
      CASH_COVER(15),
      CONCENTRATION(65),
    ],
  },
  {
    id: "realestate",
    label: "房地产",
    description: "高杠杆、预售资金监管，关注负债率与现金流覆盖。",
    rules: [
      LEVERAGE(80, "%；房地产高杠杆提示"),
      CURRENT(1),
      NET_MARGIN(5),
      CASH_COVER(10),
      CONCENTRATION(70),
    ],
  },
  {
    id: "construction",
    label: "建筑与工程",
    description: "垫资经营、回款周期长，关注应收与现金流。",
    rules: [
      LEVERAGE(75, "%；建筑类高杠杆提示"),
      CURRENT(1),
      NET_MARGIN(2),
      AR_TURNOVER(2.5),
      CASH_COVER(15),
      CONCENTRATION(65),
    ],
  },
];

export function industryProfiles(): IndustryProfile[] {
  return INDUSTRY_PROFILES;
}
