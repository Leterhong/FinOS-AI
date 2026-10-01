import { INDUSTRY_PROFILES } from "./industry-thresholds";

/**
 * 规则模板库：提供可一键启用的规则定义（阈值口径）。
 *
 * 这些是「规则模板」而非业务数据：用户启用后生成一条普通规则，可继续编辑或删除；
 * 阈值仅作风险提示，不替代授信政策。
 */
export interface RuleTemplate {
  id: string;
  group: string;
  industry: string;
  code: string;
  name: string;
  domain: string;
  metric: string;
  op: "lt" | "lte" | "gt" | "gte" | "eq";
  value: number;
  note: string;
}

const OP_LABEL: Record<RuleTemplate["op"], string> = { lt: "低于", lte: "不高于", gt: "高于", gte: "不低于", eq: "等于" };

const GENERAL: RuleTemplate[] = [
  { id: "g-leverage", group: "通用", industry: "general", code: "TPL-LEV-70", name: "资产负债率高于 70%", domain: "授信", metric: "资产负债率", op: "gt", value: 70, note: "%；负债合计 / 资产总计" },
  { id: "g-current", group: "通用", industry: "general", code: "TPL-CUR-1", name: "流动比率低于 1", domain: "授信", metric: "流动比率", op: "lt", value: 1, note: "倍；流动资产 / 流动负债" },
  { id: "g-quick", group: "通用", industry: "general", code: "TPL-QCK-08", name: "速动比率低于 0.8", domain: "授信", metric: "速动比率", op: "lt", value: 0.8, note: "倍；(流动资产 - 存货) / 流动负债" },
  { id: "g-net-margin", group: "通用", industry: "general", code: "TPL-NPM-0", name: "净利率为负", domain: "经营", metric: "净利率", op: "lt", value: 0, note: "%；净利润 / 营业收入" },
  { id: "g-profit", group: "通用", industry: "general", code: "TPL-NP-0", name: "净利润为负", domain: "经营", metric: "净利润", op: "lt", value: 0, note: "元；利润表净利润口径" },
  { id: "g-cashflow", group: "通用", industry: "general", code: "TPL-OCF-0", name: "经营活动现金流量净额为负", domain: "现金流", metric: "经营活动产生的现金流量净额", op: "lt", value: 0, note: "元；现金流量表经营净额" },
  { id: "g-cash-cover", group: "通用", industry: "general", code: "TPL-OCF-CUR-20", name: "经营现金流对流动负债覆盖低于 20%", domain: "现金流", metric: "经营现金流/流动负债", op: "lt", value: 20, note: "%；经营活动现金流量净额 / 流动负债" },
  { id: "g-interest", group: "通用", industry: "general", code: "TPL-ICR-2", name: "利息保障倍数低于 2", domain: "偿债", metric: "利息保障倍数", op: "lt", value: 2, note: "倍；息税前利润 / 利息费用" },
  { id: "g-ar", group: "通用", industry: "general", code: "TPL-AR-2", name: "应收账款周转率低于 2", domain: "营运", metric: "应收账款周转率", op: "lt", value: 2, note: "倍；营业收入 / 平均应收账款" },
  { id: "g-concentration", group: "通用", industry: "general", code: "TPL-CONC-60", name: "客户集中度高于 60%", domain: "经营", metric: "客户集中度", op: "gt", value: 60, note: "%；前五大客户收入占比" },
];

function fromIndustries(): RuleTemplate[] {
  const templates: RuleTemplate[] = [];
  for (const profile of INDUSTRY_PROFILES) {
    if (profile.id === "general") continue;
    for (const rule of profile.rules) {
      const slug = rule.metric.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").slice(0, 6);
      templates.push({
        id: `${profile.id}-${rule.metric}-${rule.op}-${rule.value}`,
        group: profile.label,
        industry: profile.id,
        code: `TPL-${profile.id.slice(0, 3).toUpperCase()}-${slug}-${rule.op.toUpperCase()}`,
        name: `${profile.label}：${rule.metric}${OP_LABEL[rule.op]} ${rule.value}`,
        domain: profile.label,
        metric: rule.metric,
        op: rule.op,
        value: rule.value,
        note: rule.note,
      });
    }
  }
  return templates;
}

export const RULE_TEMPLATES: RuleTemplate[] = [...GENERAL, ...fromIndustries()];

export function ruleTemplateGroups(): string[] {
  return [...new Set(RULE_TEMPLATES.map((item) => item.group))];
}
