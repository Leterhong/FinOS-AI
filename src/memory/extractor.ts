/**
 * Memory Extractor（Phase 6.6，用户需求九）。
 *
 * 职责：判断用户话语是否值得写入长期记忆，并结构化抽取。
 *   - 「今天股票涨了」 → 不保存（转瞬即逝的市况评论）
 *   - 「我希望 45 岁退休」 → 保存（goal，含 targetRetireAge 槽位）
 *
 * 实现：确定性规则引擎（零 LLM 成本、可测可控）。未来可叠加 LLM 抽取，
 * 接口不变（extractMemories(text) → ExtractedMemory[]）。
 */
import "server-only";

import type { ExtractedMemory, MemoryType } from "./types";

/** 中文数字 → 阿拉伯数字（覆盖常见年龄表达）。 */
const CN_NUM: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function parseNumber(raw: string): number | null {
  const direct = Number(raw);
  if (Number.isFinite(direct)) return direct;
  // 中文数字：三十五 / 四十 / 四十五
  let total = 0;
  let current = 0;
  for (const ch of raw) {
    const v = CN_NUM[ch];
    if (v === undefined) return null;
    if (v === 10) {
      current = current === 0 ? 10 : current * 10;
      total += current;
      current = 0;
    } else {
      current = v;
    }
  }
  return total + current || null;
}

const NUM_RE = "((?:\\d{1,3})|(?:[零一二两三四五六七八九十]{1,4}))";

/** 转瞬即逝 / 无长期价值的话语：直接拒绝。 */
const EPHEMERAL_RE =
  /(今天|今日|刚才|现在)?(股票|股市|大盘|基金|行情|市场).{0,6}(涨|跌|红|绿|回调|反弹)|天气|吃什么|你好|谢谢|辛苦/;

interface Rule {
  re: RegExp;
  type: MemoryType;
  importance: number;
  build: (m: RegExpMatchArray, raw: string) => Omit<ExtractedMemory, "type" | "importance" | "evidence"> | null;
}

const RULES: Rule[] = [
  // ── goal：退休目标 ──
  {
    re: new RegExp(`(?:希望|想要?|打算|计划|争取)(?:在|能在)?${NUM_RE}\\s*岁(?:之前|以前|前)?退休`),
    type: "goal",
    importance: 5,
    build: (m) => {
      const age = parseNumber(m[1]);
      if (!age || age < 25 || age > 90) return null;
      return {
        content: `用户希望在 ${age} 岁退休`,
        slots: { targetRetireAge: age },
      };
    },
  },
  // ── goal：买房 / 教育金 / 财务自由等人生目标 ──
  {
    re: /(?:希望|想要?|打算|计划|目标是)([^，。！？,!?]{0,30}?(买房|购房|换房|买车|教育金|孩子.{0,4}教育|财务自由|存够|攒够|移民|创业)[^，。！？,!?]{0,30})/,
    type: "goal",
    importance: 4,
    build: (m) => ({ content: `用户的目标：${m[1].trim()}` }),
  },
  // ── event：重大人生事件 ──
  {
    re: /(?:我|我们)?(?:刚|最近|上个月|今年|去年)?(换了?工作|跳槽|离职|失业|升职|加薪|结婚|离婚|生了?(?:孩子|宝宝|二胎)|买了?房|卖了?房|买了?车)([^，。！？,!?]{0,30})/,
    type: "event",
    importance: 4,
    build: (m) => ({ content: `重大事件：用户${m[1]}${(m[2] ?? "").trim()}` }),
  },
  // ── profile：职业 / 家庭 / 收入 ──
  {
    re: /我(?:目前|现在)?(?:是|在)([^，。！？,!?]{2,20}?)(?:工作|上班|任职|做([^，。！？,!?]{2,12}))/,
    type: "profile",
    importance: 3,
    build: (m) => ({ content: `用户职业信息：在${m[1].trim()}${m[2] ? `做${m[2].trim()}` : "工作"}` }),
  },
  {
    re: new RegExp(`我(?:今年)?${NUM_RE}\\s*岁`),
    type: "profile",
    importance: 3,
    build: (m, raw) => {
      const age = parseNumber(m[1]);
      if (!age || age < 16 || age > 100) return null;
      // 「我 40 岁退休」类语句属于目标，已被前面规则捕获，这里排除
      if (/岁.{0,4}退休/.test(raw)) return null;
      return { content: `用户年龄约 ${age} 岁`, slots: { age } };
    },
  },
  {
    re: /我(?:的)?(?:年薪|月薪|年收入|月收入|工资)(?:大概|大约|差不多)?(?:是|有|在)?\s*([\d.]+\s*[万千kKwW]?)/,
    type: "profile",
    importance: 4,
    build: (m) => ({ content: `用户收入信息：${m[0].replace(/^我(的)?/, "").trim()}`, slots: { incomeRaw: m[1].trim() } }),
  },
  {
    re: /我(?:是|属于)?(?:比较|非常|很)?(保守型?|稳健型?|激进型?|进取型?)(?:的)?(?:投资者|风格|风险偏好)?/,
    type: "profile",
    importance: 4,
    build: (m) => ({ content: `用户风险偏好：${m[1].replace(/型$/, "")}型`, slots: { riskAppetite: m[1].replace(/型$/, "") } }),
  },
  // ── behavior：投资习惯 / 关注偏好 ──
  {
    re: /我(?:一直|经常|习惯|每个?月|定期)(定投|关注|买|投资|研究)([^，。！？,!?]{2,20})/,
    type: "behavior",
    importance: 3,
    build: (m) => ({ content: `用户习惯：${m[1]}${m[2].trim()}` }),
  },
];

/**
 * 主入口：从一段用户话语中抽取值得长期保存的记忆。
 * 返回空数组 = 没有可长期保存的内容（如市况评论、寒暄）。
 */
export function extractMemories(text: string): ExtractedMemory[] {
  const raw = text.trim();
  if (!raw || raw.length < 4) return [];

  const results: ExtractedMemory[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    const m = raw.match(rule.re);
    if (!m) continue;
    const built = rule.build(m, raw);
    if (!built) continue;
    if (seen.has(built.content)) continue;
    seen.add(built.content);
    results.push({
      type: rule.type,
      importance: rule.importance,
      evidence: m[0].slice(0, 200),
      ...built,
    });
  }

  // 纯短期话语且未命中任何规则 → 不保存
  if (results.length === 0 && EPHEMERAL_RE.test(raw)) return [];
  return results;
}
