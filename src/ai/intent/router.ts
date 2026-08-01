/**
 * Intent Router（Phase 5.9.6）—— AI CFO 对话意图识别。
 *
 * 纯函数模块：不依赖任何服务端 / 客户端运行时，浏览器与服务端共用同一份分类逻辑，
 * 保证「客户端 UI 分流」与「服务端生成分流」结论一致。
 *
 * 分类优先级（从上到下，命中即返回）：
 *   1. model_info       —— 询问当前 AI 模型
 *   2. profile_update   —— 修改个人财富画像字段（需携带字段；是否带数值另判）
 *   3. general_question —— 通用金融知识科普（什么是股票 / 基金区别）
 *   4. financial_analysis —— 基于用户真实数据的财富分析 / 规划
 *   5. greeting         —— 问候 / 身份询问（仅在无其它明确意图时）
 *   6. general_question —— 兜底（绝不作为 financial_analysis 默认触发）
 *
 * 关键约束：默认意图是 general_question，绝不会「默认触发财务分析」。
 */

import type { ChatIntent } from "../types";

/** profile_update 可编辑字段定义。 */
export interface ProfileFieldDef {
  /** 命中正则（含中英文）。 */
  keys: RegExp;
  /** FinancialProfile 上的字段路径（支持 "goal.retirementAge" 嵌套）。 */
  path: "age" | "monthlySalary" | "monthlyExpenses" | "monthlyInvestment" | "liabilities" | "cashSavings" | "house" | "stockPortfolio" | "funds" | "goal.retirementAge" | "occupation";
  /** 中文标签（用于回复）。 */
  label: string;
  /** 是否为数值字段。 */
  numeric: boolean;
  /** 数值单位（仅展示用）。 */
  unit?: string;
}

export const PROFILE_FIELDS: ProfileFieldDef[] = [
  { keys: /年龄|几岁|多大|岁/, path: "age", label: "年龄", numeric: true, unit: "岁" },
  { keys: /工资|月薪|月收入|月薪资|收入|薪资/, path: "monthlySalary", label: "月收入", numeric: true, unit: "元" },
  { keys: /月支出|支出|花费|开销|消费/, path: "monthlyExpenses", label: "月支出", numeric: true, unit: "元" },
  { keys: /月投资|投资|定投|理财投入/, path: "monthlyInvestment", label: "月投资", numeric: true, unit: "元" },
  { keys: /负债|贷款|债务|欠款|按揭/, path: "liabilities", label: "负债", numeric: true, unit: "元" },
  { keys: /现金|存款|储蓄|活期|闲钱/, path: "cashSavings", label: "现金储蓄", numeric: true, unit: "元" },
  { keys: /房产|房子|房|不动产|住宅/, path: "house", label: "房产价值", numeric: true, unit: "元" },
  { keys: /股票|股权|持股/, path: "stockPortfolio", label: "股票市值", numeric: true, unit: "元" },
  { keys: /基金/, path: "funds", label: "基金市值", numeric: true, unit: "元" },
  { keys: /退休年龄|退休年纪|几岁退休/, path: "goal.retirementAge", label: "目标退休年龄", numeric: true, unit: "岁" },
  { keys: /职业|工作|行业|岗位/, path: "occupation", label: "职业", numeric: false },
];

export interface ProfileUpdateParsed {
  field: ProfileFieldDef;
  /** 解析出的数值（仅 numeric 字段且用户输入含数字时有值）。 */
  value?: number;
  /** 解析出的文本值（occupation 等字符串字段）。 */
  textValue?: string;
}

export interface IntentResult {
  intent: ChatIntent;
  /** 0~1 置信度，仅用于调试与可观测性。 */
  confidence: number;
  /** 仅 profile_update 时携带解析出的字段与值。 */
  profileUpdate?: ProfileUpdateParsed;
}

// ── 规则词典 ───────────────────────────────────────────────────────────────

const MODEL_INFO_RE =
  /(什么模型|哪个模型|用的模型|当前模型|使用.{0,4}模型|模型是什么|模型是|你的模型|你用.{0,4}模型|which model|your model|what model|model are you)/i;

const UPDATE_VERBS =
  /(修改|更新|改|设置|调整|变更|设为|改成|变成|改为|录入|填|补充|修正|纠正|改成|记一下|帮我改|把.{0,6}改)/;

const KNOWLEDGE_RE =
  /(什么是|什么叫|什么是|what is|what are|介绍一下|解释一下|讲讲|科普|了解一下|帮我理解|区别|定义|含义|怎么理解|是什么意思|概念)/i;

const FINANCIAL_RE =
  /(资产|财富|现金流|收入|支出|存款|投资|理财|股票|基金|债券|房产|房贷|负债|贷款|净值|净资产|配置|资产分配|退休|养老|规划|储蓄|收益率|回报率|风险|保险|税务|税费|债务|预算|攒钱|存钱|花钱|财务|经济|portfolio|retire|invest|asset|saving|cashflow|wealth|financial|负债率|储蓄率|应急金|紧急备用金)/i;

const GREETING_RE =
  /^(你好|您好|hi|hello|hey|哈喽|嗨|在吗|早上好|下午好|晚上好|你是谁|你是什么|你叫什么|你是|你干嘛|在不在)/i;

// 财务分析疑问词：命中后即便「字段+数字」也不当作画像更新，避免误改画像。
const ANALYSIS_Q_RE =
  /(怎么样|如何|怎么|规划|分析|评估|够吗|亏|涨|跌|风险|建议|对比|可以吗|吗\?|吗？|吗$)/;

// ── 工具函数 ───────────────────────────────────────────────────────────────

/** 解析中文/阿拉伯数字（支持 万/w/千/k/亿）。无数字返回 null。 */
export function parseNumber(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(万|w|千|k|亿)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase();
  if (unit === "万" || unit === "w") n *= 10000;
  else if (unit === "亿") n *= 100_000_000;
  else if (unit === "千" || unit === "k") n *= 1000;
  return n;
}

/** 解析 profile_update 意图中的字段与数值。 */
function parseProfileUpdate(text: string): ProfileUpdateParsed | undefined {
  const field = PROFILE_FIELDS.find((f) => f.keys.test(text));
  if (!field) return undefined;

  if (!field.numeric) {
    // 字符串字段（职业）：取「是/为/:」后的片段
    const m = text.match(/(?:是|为|：|:)\s*([\u4e00-\u9fa5a-zA-Z]{1,12})/);
    return { field, textValue: m?.[1]?.trim() };
  }

  const value = parseNumber(text);
  return { field, value: value ?? undefined };
}

// ── 主分类器 ───────────────────────────────────────────────────────────────

export function classifyIntent(text: string): IntentResult {
  const t = (text || "").trim();

  // 1. model_info（最高优先，避免与问候/知识混淆）
  if (MODEL_INFO_RE.test(t)) {
    return { intent: "model_info", confidence: 0.95 };
  }

  // 2. profile_update：命中字段 +（更新动词 或 「我的X是Y」 或 「字段+数字」且非分析疑问）
  const fieldHit = PROFILE_FIELDS.find((f) => f.keys.test(t));
  if (fieldHit) {
    const hasVerb = UPDATE_VERBS.test(t);
    const hasValueAssign = /(是|为|：|:|变成|改为|改成)/.test(t) && parseNumber(t) !== null && !ANALYSIS_Q_RE.test(t);
    const hasMyValue = /(我的|我)/.test(t) && parseNumber(t) !== null && !ANALYSIS_Q_RE.test(t);
    const hasFieldValue = parseNumber(t) !== null && !ANALYSIS_Q_RE.test(t);
    if (hasVerb || hasValueAssign || hasMyValue || hasFieldValue) {
      return { intent: "profile_update", confidence: 0.9, profileUpdate: parseProfileUpdate(t) };
    }
  }

  // 3. general_question（知识科普，优先于财务分析，避免「什么是股票」被当分析）
  if (KNOWLEDGE_RE.test(t)) {
    return { intent: "general_question", confidence: 0.9 };
  }

  // 4. financial_analysis：明确命中财务关键词
  if (FINANCIAL_RE.test(t)) {
    return { intent: "financial_analysis", confidence: 0.85 };
  }

  // 5. greeting：仅当无其它明确意图
  if (GREETING_RE.test(t)) {
    return { intent: "greeting", confidence: 0.9 };
  }

  // 6. 兜底：通用问题（绝不默认财务分析）
  return { intent: "general_question", confidence: 0.5 };
}
