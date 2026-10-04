import { INDUSTRY_PROFILES, matchIndustryProfile, type IndustryProfile } from "./industry-thresholds";

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
  /** 指标口径与单位。 */
  note: string;
  /** 规则意图（检查什么）。 */
  description: string;
  /** 计算口径依据。 */
  basis: string;
  /** 命中后的潜在影响。 */
  impact: string;
  /** 人工复核建议。 */
  suggestion: string;
}

const OP_LABEL: Record<RuleTemplate["op"], string> = { lt: "低于", lte: "不高于", gt: "高于", gte: "不低于", eq: "等于" };

interface MetricDetail {
  description: string;
  basis: string;
  impact: string;
  suggestion: string;
}

/** 指标说明库：模板按指标复用口径、影响与复核建议，保证描述一致且可维护。 */
const METRIC_DETAILS: Record<string, MetricDetail> = {
  资产负债率: { description: "检查企业杠杆水平是否偏高。", basis: "负债合计 / 资产总计", impact: "杠杆过高会削弱抗风险能力，压缩再融资空间。", suggestion: "核对有息负债、表外担保与到期结构，并对照行业均值。" },
  流动比率: { description: "检查短期偿债能力是否充足。", basis: "流动资产 / 流动负债", impact: "流动比率过低可能出现短期偿付压力。", suggestion: "核对应收账款与存货的变现质量及账龄。" },
  速动比率: { description: "检查剔除存货后的短期偿付能力。", basis: "(流动资产 - 存货) / 流动负债", impact: "速动资产不足时短期偿付依赖存货变现。", suggestion: "区分可快速变现资产与积压存货。" },
  净利率: { description: "检查盈利水平是否转弱。", basis: "净利润 / 营业收入", impact: "盈利转负或过低会侵蚀资本与偿债能力。", suggestion: "结合非经常性损益与产品结构判断盈利质量。" },
  净利润: { description: "检查是否出现经营亏损。", basis: "利润表净利润口径", impact: "持续亏损削弱内生资本积累与偿债保障。", suggestion: "核对非经常性损益、投资收益与减值计提。" },
  经营活动产生的现金流量净额: { description: "检查经营造血能力是否为正。", basis: "现金流量表经营活动净额", impact: "经营现金流为负时周转可能依赖外部融资。", suggestion: "结合银行流水与回款账期复核现金真实性。" },
  "经营现金流/流动负债": { description: "检查经营现金流对短期债务的覆盖。", basis: "经营活动现金流量净额 / 流动负债", impact: "经营造血对短债覆盖不足时偿付压力上升。", suggestion: "核对一年内到期债务与可用授信额度。" },
  利息保障倍数: { description: "检查经营利润对利息费用的覆盖。", basis: "息税前利润 / 利息费用", impact: "利息覆盖不足将提高违约与再融资风险。", suggestion: "核对外部融资成本、展期与续贷安排。" },
  应收账款周转率: { description: "检查应收账款周转效率。", basis: "营业收入 / 平均应收账款", impact: "周转偏慢会占用营运资金并放大坏账风险。", suggestion: "按客户核对应收账龄与合同账期。" },
  客户集中度: { description: "检查客户结构是否过度集中。", basis: "前五大客户收入占比", impact: "大客户依赖会放大收入波动风险。", suggestion: "核查框架协议、账期约定与大客户经营状况。" },
  现金比率: { description: "检查即时偿付能力。", basis: "货币资金 / 流动负债", impact: "即时变现能力不足时短期流动性紧张。", suggestion: "区分受限资金与可自由支配资金。" },
  毛利率: { description: "检查毛利水平是否过低。", basis: "毛利 / 营业收入", impact: "毛利过低难以覆盖期间费用与财务成本。", suggestion: "对比行业毛利与产品结构变化。" },
  存货周转率: { description: "检查存货周转效率。", basis: "营业成本 / 平均存货", impact: "周转偏慢带来跌价与资金占用风险。", suggestion: "核对库龄结构与产销存匹配情况。" },
  总资产周转率: { description: "检查资产整体使用效率。", basis: "营业收入 / 平均总资产", impact: "资产使用效率偏低会拖累回报。", suggestion: "识别闲置资产与低效投入。" },
  应收账款周转天数: { description: "检查回款周期是否拉长。", basis: "360 / 应收账款周转率", impact: "回款周期拉长增加营运资金占用与坏账风险。", suggestion: "对照合同账期、银行流水与账龄结构。" },
  存货周转天数: { description: "检查库存周转天数是否过长。", basis: "360 / 存货周转率", impact: "库存积压占用资金并带来跌价风险。", suggestion: "核对库龄、在手订单与备货策略。" },
  营业收入增长率: { description: "检查营业收入是否出现下滑。", basis: "(本期 - 上期) / 上期", impact: "收入下滑会削弱现金流入与偿债能力。", suggestion: "分析下滑原因、订单可见度与可持续性。" },
  净利润增长率: { description: "检查净利润是否出现下滑。", basis: "(本期 - 上期) / 上期", impact: "盈利下滑削弱资本积累与分红能力。", suggestion: "区分经营性因素与一次性损益影响。" },
  净资产收益率: { description: "检查资本回报水平。", basis: "净利润 / 平均净资产", impact: "资本回报为负说明股东权益受侵蚀。", suggestion: "结合资产质量与盈利可持续性判断。" },
  有息负债率: { description: "检查计息负债在总负债中的占比。", basis: "有息负债 / 负债合计", impact: "付息压力集中时再融资风险上升。", suggestion: "核对外部融资到期分布与融资成本。" },
  对外担保占净资产比: { description: "检查对外担保形成的或有负债规模。", basis: "对外担保余额 / 净资产", impact: "或有负债可能放大偿付压力。", suggestion: "核查被担保方资信、反担保与代偿风险。" },
  商誉占净资产比: { description: "检查商誉占净资产比重。", basis: "商誉 / 净资产", impact: "商誉减值会直接侵蚀净资产与利润。", suggestion: "复核并购标的业绩承诺与减值测试。" },
  股权质押比例: { description: "检查股东股权质押比例。", basis: "质押股份 / 持股总数", impact: "高质押比例带来控制权与流动性风险。", suggestion: "核查平仓线、融资用途与补仓能力。" },
  关联交易占收入比: { description: "检查关联交易依赖程度。", basis: "关联交易金额 / 营业收入", impact: "过度依赖关联交易影响经营独立性。", suggestion: "核查关联交易定价公允性与决策程序。" },
  现金短债比: { description: "检查现金对短期有息债务的覆盖。", basis: "货币资金 / 短期有息负债", impact: "覆盖不足时存在短期偿付缺口。", suggestion: "核对可动用资金、授信与到期安排。" },
  受限资金占货币资金比: { description: "检查受限资金占比。", basis: "受限资金 / 货币资金", impact: "可用资金可能明显低于账面货币资金。", suggestion: "核对保证金、冻结与共管账户明细。" },
  研发资本化率: { description: "检查研发投入资本化比例。", basis: "研发投入资本化金额 / 研发投入合计", impact: "资本化率过高可能平滑当期利润。", suggestion: "复核资本化政策、项目进度与减值测试。" },
  销售费用率: { description: "检查销售费用率是否偏高。", basis: "销售费用 / 营业收入", impact: "费用率过高会侵蚀利润与现金流。", suggestion: "对比收入增长与渠道转化效率。" },
  存货占资产比: { description: "检查存货占总资产比重。", basis: "存货 / 资产总计", impact: "存货占比过高会放大变现与跌价风险。", suggestion: "核对存货结构、库龄与生物资产计量。" },
};

const DEFAULT_DETAIL: MetricDetail = {
  description: "检查关键指标是否偏离阈值。",
  basis: "以资料抽取事实的指标口径为准",
  impact: "偏离阈值可能影响经营与偿债判断。",
  suggestion: "结合原始资料、行业情况与合同约定人工复核。",
};

function detailFor(metric: string): MetricDetail {
  return METRIC_DETAILS[metric] ?? DEFAULT_DETAIL;
}

/** 统一构造模板，自动挂载指标说明。 */
function template(
  code: string,
  name: string,
  domain: string,
  metric: string,
  op: RuleTemplate["op"],
  value: number,
  note: string,
  group = "通用",
  industry = "general",
): RuleTemplate {
  const detail = detailFor(metric);
  return { id: `tpl-${code.toLowerCase()}`, group, industry, code, name, domain, metric, op, value, note, ...detail };
}

const GENERAL: RuleTemplate[] = [
  template("TPL-LEV-70", "资产负债率高于 70%", "授信", "资产负债率", "gt", 70, "%；负债合计 / 资产总计"),
  template("TPL-CUR-1", "流动比率低于 1", "授信", "流动比率", "lt", 1, "倍；流动资产 / 流动负债"),
  template("TPL-QCK-08", "速动比率低于 0.8", "授信", "速动比率", "lt", 0.8, "倍；(流动资产 - 存货) / 流动负债"),
  template("TPL-CASH-02", "现金比率低于 0.2", "授信", "现金比率", "lt", 0.2, "倍；货币资金 / 流动负债"),
  template("TPL-NPM-0", "净利率为负", "经营", "净利率", "lt", 0, "%；净利润 / 营业收入"),
  template("TPL-NP-0", "净利润为负", "经营", "净利润", "lt", 0, "元；利润表净利润口径"),
  template("TPL-GPM-15", "毛利率低于 15%", "经营", "毛利率", "lt", 15, "%；毛利 / 营业收入"),
  template("TPL-OCF-0", "经营活动现金流量净额为负", "现金流", "经营活动产生的现金流量净额", "lt", 0, "元；现金流量表经营净额"),
  template("TPL-OCF-CUR-20", "经营现金流对流动负债覆盖低于 20%", "现金流", "经营现金流/流动负债", "lt", 20, "%；经营活动现金流量净额 / 流动负债"),
  template("TPL-CSD-05", "现金短债比低于 0.5", "现金流", "现金短债比", "lt", 0.5, "倍；货币资金 / 短期有息负债"),
  template("TPL-RFUND-30", "受限资金占货币资金比高于 30%", "现金流", "受限资金占货币资金比", "gt", 30, "%；受限资金 / 货币资金"),
  template("TPL-ICR-2", "利息保障倍数低于 2", "偿债", "利息保障倍数", "lt", 2, "倍；息税前利润 / 利息费用"),
  template("TPL-IBD-60", "有息负债率高于 60%", "偿债", "有息负债率", "gt", 60, "%；有息负债 / 负债合计"),
  template("TPL-AR-2", "应收账款周转率低于 2", "营运", "应收账款周转率", "lt", 2, "倍；营业收入 / 平均应收账款"),
  template("TPL-ARTD-90", "应收账款周转天数高于 90 天", "营运", "应收账款周转天数", "gt", 90, "天；360 / 应收账款周转率"),
  template("TPL-INV-3", "存货周转率低于 3", "营运", "存货周转率", "lt", 3, "倍；营业成本 / 平均存货"),
  template("TPL-INVD-120", "存货周转天数高于 120 天", "营运", "存货周转天数", "gt", 120, "天；360 / 存货周转率"),
  template("TPL-TAT-05", "总资产周转率低于 0.5", "营运", "总资产周转率", "lt", 0.5, "倍；营业收入 / 平均总资产"),
  template("TPL-REV-0", "营业收入增长率为负", "经营", "营业收入增长率", "lt", 0, "%；(本期 - 上期) / 上期"),
  template("TPL-NPG-0", "净利润增长率为负", "经营", "净利润增长率", "lt", 0, "%；(本期 - 上期) / 上期"),
  template("TPL-ROE-0", "净资产收益率为负", "经营", "净资产收益率", "lt", 0, "%；净利润 / 平均净资产"),
  template("TPL-CONC-60", "客户集中度高于 60%", "经营", "客户集中度", "gt", 60, "%；前五大客户收入占比"),
  template("TPL-GTE-30", "对外担保占净资产比高于 30%", "授信", "对外担保占净资产比", "gt", 30, "%；对外担保余额 / 净资产"),
  template("TPL-GW-20", "商誉占净资产比高于 20%", "授信", "商誉占净资产比", "gt", 20, "%；商誉 / 净资产"),
  template("TPL-PLG-50", "股权质押比例高于 50%", "治理", "股权质押比例", "gt", 50, "%；质押股份 / 持股总数"),
  template("TPL-RPT-30", "关联交易占收入比高于 30%", "治理", "关联交易占收入比", "gt", 30, "%；关联交易金额 / 营业收入"),
];

function fromIndustries(): RuleTemplate[] {
  const templates: RuleTemplate[] = [];
  for (const profile of INDUSTRY_PROFILES) {
    if (profile.id === "general") continue;
    for (const rule of profile.rules) {
      const slug = rule.metric.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").slice(0, 6);
      templates.push(template(
        `TPL-${profile.id.slice(0, 3).toUpperCase()}-${slug}-${rule.op.toUpperCase()}`,
        `${profile.label}：${rule.metric}${OP_LABEL[rule.op]} ${rule.value}`,
        profile.label,
        rule.metric,
        rule.op,
        rule.value,
        rule.note,
        profile.label,
        profile.id,
      ));
    }
  }
  return templates;
}

export const RULE_TEMPLATES: RuleTemplate[] = [...GENERAL, ...fromIndustries()];

export function ruleTemplateGroups(): string[] {
  return [...new Set(RULE_TEMPLATES.map((item) => item.group))];
}

/** 依据企业所属行业推荐规则模板：命中行业返回该行业模板，否则返回通用模板。 */
export function recommendedTemplates(industryText: string | undefined | null): { profile: IndustryProfile; templates: RuleTemplate[] } {
  const profile = matchIndustryProfile(industryText);
  const templates = RULE_TEMPLATES.filter((item) => item.industry === (profile.id === "general" ? "general" : profile.id));
  return { profile, templates };
}
