import type { RiskLevel } from "@/types/enterprise";

/**
 * 上市公司公告 → 候选风险信号的确定性关键词归类（纯函数，无模型）。
 * 只做「按标题关键词归类并给出等级建议」，结论仍需人工核验；用于把巨潮资讯公告快速转成风险线索。
 */

export interface AnnouncementLike {
  title: string;
  date?: string;
  pdf?: string;
}

export interface ClassifiedRisk {
  category: string;
  level: RiskLevel;
  keyword: string;
  title: string;
  date: string;
  pdf: string;
}

interface RiskRule {
  category: string;
  level: RiskLevel;
  keywords: string[];
}

/** 规则按严重度从高到低排列；命中第一条即返回。 */
const RISK_RULES: RiskRule[] = [
  { category: "诉讼与执行", level: "critical", keywords: ["被执行", "失信", "破产", "重整", "查封", "冻结", "诉讼", "仲裁", "法院", "强制执行", "执行通知", "限制消费", "限高"] },
  { category: "债务风险", level: "critical", keywords: ["逾期", "违约", "无法偿还", "偿债风险", "债务违约"] },
  { category: "合规风险", level: "high", keywords: ["立案", "处罚", "违规", "警示", "问询", "监管", "调查", "公开谴责"] },
  { category: "业绩风险", level: "high", keywords: ["预亏", "亏损", "业绩预减", "业绩下滑", "业绩下修", "盈利预警"] },
  { category: "资产减值", level: "high", keywords: ["商誉减值", "计提减值", "资产减值", "坏账"] },
  { category: "股权质押", level: "medium", keywords: ["股权质押", "补充质押", "质押"] },
  { category: "股东减持", level: "medium", keywords: ["减持"] },
  { category: "对外担保", level: "medium", keywords: ["对外担保", "担保"] },
  { category: "重大事项", level: "medium", keywords: ["重大合同", "重大诉讼", "收购", "重组"] },
];

const LEVEL_ORDER: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function classifyAnnouncement(item: AnnouncementLike): ClassifiedRisk | null {
  const title = (item.title ?? "").trim();
  if (!title) return null;
  for (const rule of RISK_RULES) {
    const keyword = rule.keywords.find((word) => title.includes(word));
    if (keyword) {
      return { category: rule.category, level: rule.level, keyword, title, date: item.date ?? "", pdf: item.pdf ?? "" };
    }
  }
  return null;
}

/** 批量归类并按严重度排序（重大 → 高 → 中 → 低）。 */
export function classifyAnnouncements(items: AnnouncementLike[]): ClassifiedRisk[] {
  return items
    .map(classifyAnnouncement)
    .filter((item): item is ClassifiedRisk => item !== null)
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
