import type { RuleCondition } from "./rule-engine";

/**
 * 规则包（Rule Pack）：规则库的可移植序列化格式，用于团队共享、备份与迁移。
 * 只承载规则定义，不含企业业务数据；导入时逐条校验并跳过重复编号。
 */

export interface RulePackRule {
  code: string;
  name: string;
  domain: string;
  version?: string;
  conditions?: RuleCondition[];
  enabled?: boolean;
  industries?: string[];
}

export interface RulePack {
  kind: "finos-rule-pack";
  version: number;
  exportedAt?: string;
  rules: RulePackRule[];
}

const OPS: readonly RuleCondition["op"][] = ["lt", "lte", "gt", "gte", "eq"];
const MAX_RULES = 500;
const MAX_TEXT = 200;
const MAX_CONDITIONS = 10;

/** 从现有规则构造可导出的规则包。 */
export function buildRulePack(rules: RulePackRule[], exportedAt: string = new Date().toISOString()): RulePack {
  return {
    kind: "finos-rule-pack",
    version: 1,
    exportedAt,
    rules: rules.map((rule) => ({
      code: rule.code.trim(),
      name: rule.name.trim(),
      domain: rule.domain.trim(),
      version: rule.version?.trim() || "v1.0",
      conditions: rule.conditions,
      enabled: rule.enabled !== false,
      industries: rule.industries ?? [],
    })),
  };
}

export function serializeRulePack(pack: RulePack): string {
  return JSON.stringify(pack, null, 2);
}

export type RulePackParseResult =
  | { ok: true; rules: RulePackRule[] }
  | { ok: false; error: string };

function parseConditions(value: unknown): RuleCondition[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CONDITIONS) return null;
  const conditions: RuleCondition[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const metric = typeof item.metric === "string" ? item.metric.trim() : "";
    const op = item.op;
    const value = typeof item.value === "number" ? item.value : Number(item.value);
    if (!metric || metric.length > MAX_TEXT) return null;
    if (typeof op !== "string" || !OPS.includes(op as RuleCondition["op"])) return null;
    if (!Number.isFinite(value)) return null;
    conditions.push({ metric, op: op as RuleCondition["op"], value });
  }
  return conditions;
}

/** 解析并校验规则包文本；任何结构问题都返回可读错误，绝不写入半成品。 */
export function parseRulePack(text: string): RulePackParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "文件不是合法 JSON" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "规则包必须是 JSON 对象" };
  }
  const rawRules = (data as Record<string, unknown>).rules;
  if (!Array.isArray(rawRules)) return { ok: false, error: "缺少 rules 数组" };
  if (rawRules.length === 0) return { ok: false, error: "规则包为空" };
  if (rawRules.length > MAX_RULES) return { ok: false, error: `规则数量超过上限 ${MAX_RULES} 条` };

  const rules: RulePackRule[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < rawRules.length; index += 1) {
    const raw = rawRules[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `第 ${index + 1} 条规则格式不正确` };
    }
    const item = raw as Record<string, unknown>;
    const code = typeof item.code === "string" ? item.code.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const domain = typeof item.domain === "string" ? item.domain.trim() : "";
    if (!code || !name || !domain) {
      return { ok: false, error: `第 ${index + 1} 条规则缺少 code/name/domain` };
    }
    if (code.length > MAX_TEXT || name.length > MAX_TEXT || domain.length > MAX_TEXT) {
      return { ok: false, error: `第 ${index + 1} 条规则文本过长` };
    }
    if (seen.has(code)) continue;
    seen.add(code);
    const conditions = parseConditions(item.conditions);
    if (conditions === null) {
      return { ok: false, error: `第 ${index + 1} 条规则触发条件不合法` };
    }
    const industries = Array.isArray(item.industries)
      ? item.industries.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).slice(0, 20)
      : [];
    rules.push({
      code,
      name,
      domain,
      version: typeof item.version === "string" && item.version.trim() ? item.version.trim().slice(0, 40) : "v1.0",
      conditions: conditions.length ? conditions : undefined,
      enabled: item.enabled !== false,
      industries,
    });
  }
  if (rules.length === 0) return { ok: false, error: "规则包没有可用规则" };
  return { ok: true, rules };
}
