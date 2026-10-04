/**
 * 财务指标名称归一化与语义别名。
 *
 * 规则引擎与财务指标计算共用：事实抽取的主题（如「净资产收益率(ROE)」）
 * 与规则口径（如「净资产收益率」）经常只差连接词、括号或同义写法，
 * 精确匹配会造成真实风险被静默漏判（假阴性）。
 */

/** 连接词/修饰词：归一化时移除，避免「经营活动产生的现金流量净额」与「经营活动现金流量净额」不等。 */
const FILLER_WORDS = ["产生的", "产生", "的", "本期", "期末", "年初", "年末"];

/** 常见财务指标同义写法分组：任意一项与同组其他项视为同一指标。 */
const ALIAS_GROUPS: string[][] = [
  ["经营活动产生的现金流量净额", "经营活动现金流量净额", "经营现金流量净额", "经营活动现金流净额", "经营现金流", "经营活动现金流"],
  ["销售商品提供劳务收到的现金", "销售商品、提供劳务收到的现金", "销售回款"],
  ["货币资金", "现金及现金等价物", "现金及银行存款"],
  ["营业收入", "主营业务收入", "营业总收入", "销售收入"],
  ["营业成本", "主营业务成本", "营业总成本"],
  ["资产总计", "总资产", "资产合计"],
  ["负债合计", "总负债", "负债总计"],
  ["所有者权益合计", "股东权益合计", "净资产", "所有者权益"],
  ["流动资产", "流动资产合计"],
  ["流动负债", "流动负债合计"],
  ["非流动资产", "非流动资产合计"],
  ["非流动负债", "非流动负债合计"],
  ["有息负债", "计息负债", "付息负债", "带息负债"],
  ["EBITDA", "息税折旧摊销前利润", "息税折旧及摊销前利润"],
  ["受限资金", "使用受限货币资金", "受限货币资金"],
  ["对外担保余额", "对外担保", "担保余额", "对外担保总额"],
  ["商誉", "商誉净额"],
  ["合同负债", "预收款项", "预收账款"],
  ["存货周转率", "存货周转次数"],
  ["现金比率", "现金资产比率"],
  ["利息保障倍数", "已获利息倍数"],
  ["净利润", "归母净利润", "归属于母公司股东的净利润", "归属于母公司所有者的净利润", "净利润（含少数股东损益）"],
  ["利润总额", "税前利润"],
  ["资产负债率", "负债率"],
  ["毛利率", "销售毛利率"],
  ["净利率", "销售净利率"],
  ["净资产收益率", "roe", "净资产回报率"],
  ["总资产收益率", "roa", "总资产回报率"],
  ["应收账款", "应收账款净额", "应收账款余额"],
  ["平均应收账款", "应收账款平均余额", "应收账款平均占用"],
  ["存货", "存货净额"],
  ["应收账款周转率", "应收周转率"],
  ["速动比率", "酸性测试比率"],
  ["应收账款周转天数", "应收周转天数", "应收账款周转期"],
  ["存货周转天数", "存货周转期", "库存周转天数"],
  ["总资产周转率", "资产周转率"],
  ["营业收入增长率", "营收增长率", "收入增长率"],
  ["净利润增长率", "净利增长率", "净利润增速"],
  ["有息负债率", "有息负债占比", "计息负债率"],
  ["对外担保占净资产比", "对外担保/净资产", "担保占净资产比"],
  ["商誉占净资产比", "商誉/净资产", "商誉占比"],
  ["股权质押比例", "股权质押率", "质押比例"],
  ["关联交易占收入比", "关联交易占比", "关联交易收入占比"],
  ["受限资金占货币资金比", "受限资金占比"],
  ["现金短债比", "现金对短期债务比", "现金/短期有息负债"],
  ["研发资本化率", "研发投入资本化率"],
  ["销售费用率", "销售费用占比"],
  ["存货占资产比", "存货占总资产比", "存货资产占比"],
];

/** 全角转半角 + 去空格/常见标点，便于统一比较。 */
function basicClean(value: string): string {
  return value
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[（）()【】\[\]：:、，,"'“”‘’\s]/g, "")
    .toLowerCase();
}

/** 指标名归一化：全角转半角、去标点与连接词。 */
export function normalizeMetricName(value: string): string {
  let s = basicClean(value);
  for (const filler of FILLER_WORDS) s = s.split(basicClean(filler)).join("");
  return s;
}

const CANONICAL_LOOKUP = (() => {
  const map = new Map<string, string>();
  for (const group of ALIAS_GROUPS) {
    const canonical = normalizeMetricName(group[0]);
    for (const variant of group) {
      map.set(normalizeMetricName(variant), canonical);
    }
  }
  return map;
})();

/** 归一化到同组代表名（无别名时返回其自身归一化结果）。 */
export function canonicalMetricName(value: string): string {
  const normalized = normalizeMetricName(value);
  return CANONICAL_LOOKUP.get(normalized) ?? normalized;
}

/**
 * 事实主题与规则指标的语义匹配：
 *  1. 归一化 + 别名后完全相等；
 *  2. 互为包含（覆盖「本期货币资金」等前缀/后缀写法）。
 */
export function metricTopicMatches(factTopic: string, metric: string): boolean {
  const a = canonicalMetricName(factTopic);
  const b = canonicalMetricName(metric);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  // 过短的包含容易误判（如「现金」），要求至少 3 个字符。
  return shorter.length >= 3 && longer.includes(shorter);
}
