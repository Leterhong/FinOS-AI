import type { AnalysisDocument, EnterpriseRule, EvidenceFact } from "@/types/enterprise";

/** 从助手回答中提取引用的结构化来源（事实 / 规则 / 外部数据），供前端展示与跳转。 */

export interface AnswerReference {
  type: "fact" | "rule" | "external";
  id?: string;
  label: string;
  href: string;
}

export function buildAnswerReferences(answer: string, context: {
  documents?: AnalysisDocument[];
  rules?: EnterpriseRule[];
  external?: unknown;
} | null | undefined): AnswerReference[] {
  if (!answer || !context) return [];
  const refs: AnswerReference[] = [];

  for (const document of context.documents ?? []) {
    for (const fact of (document.factItems ?? []) as EvidenceFact[]) {
      const hit = (fact.id && answer.includes(fact.id)) || (fact.quote && answer.includes(fact.quote));
      if (hit) refs.push({ type: "fact", id: fact.id, label: `事实：${fact.topic}`, href: `/documents?caseId=${encodeURIComponent(fact.caseId ?? "")}` });
    }
  }

  for (const rule of context.rules ?? []) {
    if (rule.code && answer.includes(rule.code)) {
      refs.push({ type: "rule", id: rule.code, label: `规则：${rule.code}${rule.name ? ` ${rule.name}` : ""}`, href: "/rules" });
    }
  }

  if (context.external) refs.push({ type: "external", label: "外部宏观/汇率数据（需人工复核）", href: "/research" });

  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.type}:${ref.id ?? ref.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}
