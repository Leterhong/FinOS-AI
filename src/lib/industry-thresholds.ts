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
const GROSS = (value: number): ThresholdRule => ({ metric: "毛利率", op: "lt", value, note: "%；毛利 / 营业收入" });
const RD_CAP = (value: number): ThresholdRule => ({ metric: "研发资本化率", op: "gt", value, note: "%；研发投入资本化金额 / 研发投入合计" });
const SELL_EXP = (value: number): ThresholdRule => ({ metric: "销售费用率", op: "gt", value, note: "%；销售费用 / 营业收入" });
const INV_ASSET = (value: number): ThresholdRule => ({ metric: "存货占资产比", op: "gt", value, note: "%；存货 / 资产总计" });

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
  {
    id: "software",
    label: "软件与信息服务",
    description: "轻资产、高毛利，关注研发资本化、客户集中与回款。",
    rules: [
      RD_CAP(30),
      GROSS(40),
      CONCENTRATION(50),
      AR_TURNOVER(3),
      CASH_COVER(20),
      NET_MARGIN(0),
    ],
  },
  {
    id: "pharma",
    label: "医药与医疗",
    description: "销售驱动、研发投入大，关注费用率、研发资本化与应收。",
    rules: [
      SELL_EXP(40),
      RD_CAP(30),
      LEVERAGE(60, "%；医药行业杠杆提示"),
      AR_TURNOVER(2.5),
      CONCENTRATION(55),
    ],
  },
  {
    id: "logistics",
    label: "交通运输与物流",
    description: "资产投入与周转并重，关注杠杆、流动性与盈利。",
    rules: [
      LEVERAGE(70, "%；物流行业杠杆提示"),
      CURRENT(1),
      NET_MARGIN(2),
      AR_TURNOVER(4),
      CASH_COVER(15),
    ],
  },
  {
    id: "agriculture",
    label: "农林牧渔",
    description: "存货与生物资产占比高、周期性强，关注存货结构、杠杆与现金流。",
    rules: [
      INV_ASSET(40),
      LEVERAGE(65, "%；农业行业杠杆提示"),
      NET_MARGIN(2),
      CASH_COVER(15),
      CURRENT(1),
    ],
  },
];

export function industryProfiles(): IndustryProfile[] {
  return INDUSTRY_PROFILES;
}

/** 行业关键词 → 分组（用于根据项目所属行业推荐模板）。 */
const INDUSTRY_KEYWORDS: Array<{ id: string; keywords: string[] }> = [
  { id: "pharma", keywords: ["医药", "制药", "生物", "医疗", "疫苗", "药业", "医疗器械"] },
  { id: "manufacturing", keywords: ["制造", "生产", "加工", "装备", "机械", "电子", "化工", "纺织", "汽车", "材料", "食品"] },
  { id: "trading", keywords: ["贸易", "批发", "零售", "商贸", "流通", "供应链", "分销", "电商"] },
  { id: "realestate", keywords: ["房地产", "地产", "置业", "物业", "不动产", "开发"] },
  { id: "construction", keywords: ["建筑", "工程", "施工", "建设", "基建", "安装", "装饰"] },
  { id: "software", keywords: ["软件", "信息", "数据", "互联网", "云计算", "SaaS", "信息技术", "科技"] },
  { id: "logistics", keywords: ["物流", "运输", "仓储", "航运", "快递", "货运", "配送"] },
  { id: "agriculture", keywords: ["农业", "农林", "畜牧", "养殖", "渔业", "种业", "农产品", "牧业"] },
];

/** 根据自由文本行业匹配到阈值分组；无法匹配时回退到「通用」。 */
export function matchIndustryProfile(industryText: string | undefined | null): IndustryProfile {
  const text = (industryText ?? "").trim();
  const general = INDUSTRY_PROFILES.find((profile) => profile.id === "general")!;
  if (!text) return general;
  for (const entry of INDUSTRY_KEYWORDS) {
    if (entry.keywords.some((keyword) => text.includes(keyword))) {
      return INDUSTRY_PROFILES.find((profile) => profile.id === entry.id) ?? general;
    }
  }
  return general;
}
