import type { AnalysisDocument, EnterpriseCase, EnterpriseRule, EvidenceFact, RiskSignal } from "@/types/enterprise";

/** 风险清单导出共用的分组、规则依据与证据高亮逻辑。 */

export const LEVEL_ORDER: Record<RiskSignal["level"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const LEVEL_LABEL: Record<RiskSignal["level"], string> = { low: "低风险", medium: "中风险", high: "高风险", critical: "重大风险" };
export const LEVEL_COLOR: Record<RiskSignal["level"], string> = { low: "2E7D32", medium: "B7791F", high: "C0392B", critical: "7B241C" };
export const LABEL_COLOR = "1F4E79";
export const MUTED_COLOR = "808080";
export const HIGHLIGHT_COLOR = "C0392B";

export interface ExportRisk {
  title: string;
  level: RiskSignal["level"];
  status: string;
  company: string;
  evidence: string;
  evidenceQuotes: string[];
  ruleRefs: string;
  ruleText: string;
  impact: string;
  factIds: string[];
  ruleCodes: string[];
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNote?: string;
}

export interface ExportGroup {
  project: string;
  risks: ExportRisk[];
}

export interface ExportContext {
  cases: EnterpriseCase[];
  rules: EnterpriseRule[];
  documents: AnalysisDocument[];
}

function factQuotes(documents: AnalysisDocument[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const document of documents) {
    for (const fact of (document.factItems ?? []) as EvidenceFact[]) {
      if (fact.quote) map.set(fact.id, fact.quote);
    }
  }
  return map;
}

/** 规则命中依据：关联规则库的 编号@版本·名称（业务域）。 */
function ruleReferences(risk: RiskSignal, rules: EnterpriseRule[]): string {
  if (!risk.ruleCodes?.length) return "";
  return risk.ruleCodes
    .map((code) => {
      const rule = rules.find((item) => item.code === code);
      return rule ? `${rule.code}@${rule.version} ${rule.name}（${rule.domain}）` : code;
    })
    .join("；");
}

export function buildExportGroups(risks: RiskSignal[], context: ExportContext): ExportGroup[] {
  const quotes = factQuotes(context.documents);
  const groups = new Map<string, ExportRisk[]>();
  for (const risk of risks) {
    const entityCase = context.cases.find((item) => item.id === risk.caseId);
    const project = entityCase ? `${entityCase.company} · ${entityCase.title}` : (risk.company || "未关联项目");
    const enriched: ExportRisk = {
      title: risk.title,
      level: risk.level,
      status: risk.status,
      company: risk.company,
      evidence: risk.evidence,
      evidenceQuotes: (risk.factIds ?? []).map((id) => quotes.get(id) ?? "").filter(Boolean),
      ruleRefs: ruleReferences(risk, context.rules),
      ruleText: risk.rule,
      impact: risk.impact,
      factIds: risk.factIds ?? [],
      ruleCodes: risk.ruleCodes ?? [],
      verifiedBy: risk.verifiedBy,
      verifiedAt: risk.verifiedAt,
      verificationNote: risk.verificationNote,
    };
    const bucket = groups.get(project) ?? [];
    bucket.push(enriched);
    groups.set(project, bucket);
  }
  return [...groups.entries()].map(([project, items]) => ({
    project,
    risks: items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]),
  }));
}

/** 把证据文本按引用原文切分为高亮/非高亮片段。 */
export function highlightSegments(text: string, quotes: string[]): Array<{ text: string; mark: boolean }> {
  const source = text ?? "";
  const valid = quotes.filter((quote) => quote && quote.trim().length >= 2).sort((a, b) => b.length - a.length);
  if (!valid.length) return [{ text: source, mark: false }];
  const segments: Array<{ text: string; mark: boolean }> = [];
  let index = 0;
  while (index < source.length) {
    let matched: string | null = null;
    for (const quote of valid) {
      if (source.startsWith(quote, index)) { matched = quote; break; }
    }
    if (matched) {
      segments.push({ text: matched, mark: true });
      index += matched.length;
    } else {
      const last = segments[segments.length - 1];
      if (last && !last.mark) last.text += source[index];
      else segments.push({ text: source[index], mark: false });
      index += 1;
    }
  }
  return segments;
}

export function countInGroup(group: ExportGroup): { total: number; byLevel: Record<RiskSignal["level"], number> } {
  const byLevel = { low: 0, medium: 0, high: 0, critical: 0 } as Record<RiskSignal["level"], number>;
  for (const risk of group.risks) byLevel[risk.level] += 1;
  return { total: group.risks.length, byLevel };
}
