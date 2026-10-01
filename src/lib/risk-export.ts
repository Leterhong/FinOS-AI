import type { AnalysisDocument, EnterpriseCase, EnterpriseRule, EvidenceFact, RiskSignal } from "@/types/enterprise";
import { calculateFinancialMetrics, calculateFinancialTrends, type FinancialMetric, type FinancialTrend } from "@/lib/financial-analysis";

/** 风险清单导出共用的分组、企业基础信息、财务指标与统计逻辑。 */

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

export interface GroupMeta {
  company: string;
  title: string;
  industry: string;
  amount: string;
  owner: string;
  status: string;
  risk: string;
  progress: number;
  classification?: string;
  createdAt?: string;
}

export interface GroupStats {
  total: number;
  byLevel: Record<RiskSignal["level"], number>;
  pending: number;
  confirmed: number;
  mitigated: number;
  documents: number;
  facts: number;
}

export interface ExportGroup {
  caseId: string;
  project: string;
  meta: GroupMeta | null;
  stats: GroupStats;
  financialMetrics: FinancialMetric[];
  financialTrends: FinancialTrend[];
  risks: ExportRisk[];
}

export interface ExportContext {
  cases: EnterpriseCase[];
  rules: EnterpriseRule[];
  documents: AnalysisDocument[];
}

function allFacts(documents: AnalysisDocument[]): EvidenceFact[] {
  return documents.flatMap((document) => (document.factItems ?? []) as EvidenceFact[]);
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
  const buckets = new Map<string, RiskSignal[]>();
  for (const risk of risks) {
    const key = risk.caseId || "";
    buckets.set(key, [...(buckets.get(key) ?? []), risk]);
  }

  const groups: ExportGroup[] = [];
  for (const [caseId, items] of buckets) {
    const entityCase = context.cases.find((item) => item.id === caseId) ?? null;
    const project = entityCase ? `${entityCase.company} · ${entityCase.title}` : (items[0]?.company || "未关联项目");
    const documents = context.documents.filter((document) => document.caseId === caseId);
    const facts = allFacts(documents);

    const byLevel = { low: 0, medium: 0, high: 0, critical: 0 } as Record<RiskSignal["level"], number>;
    for (const risk of items) byLevel[risk.level] += 1;
    const stats: GroupStats = {
      total: items.length,
      byLevel,
      pending: items.filter((risk) => risk.status === "待核验").length,
      confirmed: items.filter((risk) => risk.status === "已确认").length,
      mitigated: items.filter((risk) => risk.status === "已缓释").length,
      documents: documents.length,
      facts: facts.length,
    };

    const quoteById = new Map<string, string>();
    for (const fact of facts) if (fact.quote) quoteById.set(fact.id, fact.quote);

    const risks_ = items
      .map((risk): ExportRisk => ({
        title: risk.title,
        level: risk.level,
        status: risk.status,
        company: risk.company,
        evidence: risk.evidence,
        evidenceQuotes: (risk.factIds ?? []).map((id) => quoteById.get(id) ?? "").filter(Boolean),
        ruleRefs: ruleReferences(risk, context.rules),
        ruleText: risk.rule,
        impact: risk.impact,
        factIds: risk.factIds ?? [],
        ruleCodes: risk.ruleCodes ?? [],
        verifiedBy: risk.verifiedBy,
        verifiedAt: risk.verifiedAt,
        verificationNote: risk.verificationNote,
      }))
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

    groups.push({
      caseId,
      project,
      meta: entityCase
        ? {
            company: entityCase.company,
            title: entityCase.title,
            industry: entityCase.industry,
            amount: entityCase.amount,
            owner: entityCase.owner,
            status: entityCase.status,
            risk: entityCase.risk,
            progress: entityCase.progress,
            classification: entityCase.classification,
            createdAt: entityCase.createdAt,
          }
        : null,
      stats,
      financialMetrics: calculateFinancialMetrics(facts),
      financialTrends: calculateFinancialTrends(facts),
      risks: risks_,
    });
  }

  return groups.sort((a, b) => a.project.localeCompare(b.project, "zh-CN"));
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
