"use client";

// ── Personal Document Center（Phase 6.7，需求十）───────────────────────────
// AI 数据助手：上传财务资料（PDF/Excel/CSV/图片）→ AI 理解 → 用户确认 → 写入财富画像。
// 状态机：处理中 → 需要确认 →（用户确认）→ 已完成；失败 → 识别失败。
// AI 识别结果绝不自动写入，必须人工确认（human-in-the-loop）。

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GradientText from "@/components/ui/GradientText";
import { Button } from "@/components/ui/button";
import {
  FileUp,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { IMPORT_SOURCE_LABELS } from "@/financial-data/types";

/* ---------------------------- 类型（与后端契约对齐） ---------------------------- */

type AnalysisStatus = "processing" | "needs_confirm" | "confirmed" | "failed";

interface ExtractionStats {
  transactionCount: number;
  holdingCount: number;
  policyCount: number;
  incomeCount: number;
  totalHoldingValue: number;
  monthlyIncome?: number;
  monthlyExpense?: number;
}

interface AnalysisLite {
  id: string;
  docId: string;
  kind: string;
  source?: string;
  status: AnalysisStatus;
  ocrUsed: boolean;
  visionUsed: boolean;
  confidence?: number;
  error?: string;
  warnings: string[];
  textPreview?: string;
  appliedAt?: string;
  extracted: {
    transactions: {
      date: string;
      amount: number;
      direction: string;
      category: string;
      merchant: string;
      description: string;
    }[];
    holdings: {
      name: string;
      code?: string;
      type: string;
      shares?: number;
      marketValue: number;
    }[];
    policies: {
      insurer: string;
      productName: string;
      policyType: string;
      coverage?: number;
      premium?: number;
    }[];
    incomes: { label: string; amount: number; period: string }[];
    stats: ExtractionStats;
  };
}

interface DocItem {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  analysis: AnalysisLite | null;
}

const KIND_LABELS: Record<string, string> = {
  payslip: "工资单",
  "bank-statement": "银行流水",
  insurance: "保险合同",
  holdings: "投资持仓",
  "asset-sheet": "资产表",
  expense: "消费账单",
  "investment-report": "投资报告",
  unknown: "未识别类型",
};

const STATUS_META: Record<
  AnalysisStatus,
  { label: string; cls: string; icon: React.ReactNode }
> = {
  processing: {
    label: "处理中",
    cls: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  needs_confirm: {
    label: "需要确认",
    cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  confirmed: {
    label: "已完成",
    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "识别失败",
    cls: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtMoney(n: number): string {
  return `¥${n.toLocaleString("zh-CN")}`;
}

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mime.includes("sheet") || mime.includes("csv") || mime.includes("excel"))
    return <FileSpreadsheet className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

/* ---------------------------------- 页面 ---------------------------------- */

export default function DocumentCenterPage() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = useCallback((ok: boolean, text: string) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const json = await res.json();
        setDocs(json.documents ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ------------------------------ 上传 ------------------------------ */

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/documents", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) {
          flash(false, json.error ?? "上传失败");
          return;
        }
        const a: AnalysisLite | undefined = json.analysis;
        if (a?.status === "needs_confirm") {
          flash(
            true,
            `AI 已识别「${KIND_LABELS[a.kind] ?? a.kind}」，请核对后确认写入${
              json.cached ? "（命中同文件缓存，未重复分析）" : ""
            }`
          );
        } else if (a?.status === "failed") {
          flash(false, a.error ?? "识别失败，可尝试重新分析");
        } else {
          flash(true, "上传成功");
        }
        setExpanded(json.document?.id ?? null);
        await load();
      } catch {
        flash(false, "网络错误，上传失败");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [flash, load]
  );

  /* ------------------------------ 操作 ------------------------------ */

  const handleConfirm = useCallback(
    async (docId: string) => {
      setBusyId(docId);
      try {
        const res = await fetch(`/api/documents/${docId}/confirm`, {
          method: "POST",
        });
        const json = await res.json();
        if (json.ok) {
          const nw = json.twin?.netWorth;
          flash(
            true,
            `已写入财富画像并重算数字分身${nw != null ? `，最新净资产 ${fmtMoney(nw)}` : ""}`
          );
        } else {
          flash(false, json.error ?? "确认失败");
        }
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [flash, load]
  );

  const handleReanalyze = useCallback(
    async (docId: string) => {
      setBusyId(docId);
      try {
        const res = await fetch(`/api/documents/${docId}/analyze`, {
          method: "POST",
        });
        const json = await res.json();
        if (json.ok) flash(true, "重新分析完成，请核对识别结果");
        else flash(false, json.analysis?.error ?? "重新分析失败");
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [flash, load]
  );

  const handleDelete = useCallback(
    async (docId: string) => {
      setBusyId(docId);
      try {
        const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
        if (res.ok) flash(true, "已删除文件及其 AI 识别记录");
        else flash(false, "删除失败");
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [flash, load]
  );

  /* ------------------------------ 统计 ------------------------------ */

  const needConfirm = docs.filter(
    (d) => d.analysis?.status === "needs_confirm"
  ).length;
  const confirmed = docs.filter(
    (d) => d.analysis?.status === "confirmed"
  ).length;

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {/* 标题 */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              <GradientText>财富资料中心</GradientText>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              上传工资单、银行流水、持仓截图等资料，AI 自动理解并生成财富数据 ——
              识别结果须经您确认后才会写入财富画像
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            资料加密存储 · 仅您本人可见
          </div>
        </div>

        {/* 统计卡 */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "资料总数", value: docs.length },
            { label: "待确认", value: needConfirm },
            { label: "已入画像", value: confirmed },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border/60 bg-card/50 p-4"
            >
              <div className="text-2xl font-semibold">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {/* 上传区 */}
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-card/30 px-6 py-10 text-center transition hover:border-primary/50 hover:bg-card/60"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void handleUpload(f);
          }}
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-sm">AI 正在理解您的资料…</div>
            </>
          ) : (
            <>
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium">
                点击或拖拽上传财务资料
              </div>
              <div className="text-xs text-muted-foreground">
                支持 PDF / Excel / CSV / 图片截图，单文件 ≤ 10MB
              </div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />
        </div>

        {/* toast */}
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              toast.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-rose-500/30 bg-rose-500/10 text-rose-400"
            }`}
          >
            {toast.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {toast.text}
          </motion.div>
        )}

        {/* 文档列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-card/30 py-16 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-3 text-sm font-medium">还没有上传任何资料</div>
            <div className="mt-1 text-xs text-muted-foreground">
              上传第一份工资单或持仓文件，让 AI 帮您构建财富画像
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => {
              const a = doc.analysis;
              const meta = a ? STATUS_META[a.status] : null;
              const isOpen = expanded === doc.id;
              const busy = busyId === doc.id;
              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-border/60 bg-card/50"
                >
                  {/* 行头 */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="text-muted-foreground">
                      {fileIcon(doc.mimeType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {doc.fileName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{fmtSize(doc.size)}</span>
                        {a && (
                          <span className="rounded bg-secondary px-1.5 py-0.5">
                            {KIND_LABELS[a.kind] ?? a.kind}
                          </span>
                        )}
                        {a?.source && (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400/90">
                            {IMPORT_SOURCE_LABELS[a.source as keyof typeof IMPORT_SOURCE_LABELS] ?? a.source}
                          </span>
                        )}
                        {a?.visionUsed && (
                          <span className="rounded bg-secondary px-1.5 py-0.5">
                            视觉识别
                          </span>
                        )}
                      </div>
                    </div>
                    {meta && (
                      <span
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${meta.cls}`}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(isOpen ? null : doc.id)}
                    >
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* 展开详情 */}
                  {isOpen && a && (
                    <div className="border-t border-border/60 px-4 py-4">
                      {a.status === "failed" ? (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-400">
                          {a.error ?? "识别失败"}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* 识别摘要 */}
                          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                            {a.extracted.stats.transactionCount > 0 && (
                              <SummaryChip
                                label="交易记录"
                                value={`${a.extracted.stats.transactionCount} 条`}
                              />
                            )}
                            {a.extracted.stats.holdingCount > 0 && (
                              <SummaryChip
                                label="投资持仓"
                                value={`${a.extracted.stats.holdingCount} 项 / ${fmtMoney(a.extracted.stats.totalHoldingValue)}`}
                              />
                            )}
                            {a.extracted.stats.policyCount > 0 && (
                              <SummaryChip
                                label="保险合同"
                                value={`${a.extracted.stats.policyCount} 份`}
                              />
                            )}
                            {a.extracted.stats.monthlyIncome != null && (
                              <SummaryChip
                                label="识别月收入"
                                value={fmtMoney(a.extracted.stats.monthlyIncome)}
                              />
                            )}
                            {a.extracted.stats.monthlyExpense != null && (
                              <SummaryChip
                                label="月均支出"
                                value={fmtMoney(a.extracted.stats.monthlyExpense)}
                              />
                            )}
                          </div>

                          {/* 数据可信度（需求九） */}
                          {a.confidence != null && <ConfidenceBadge value={a.confidence} />}

                          {/* 明细预览 */}
                          {a.extracted.holdings.length > 0 && (
                            <PreviewTable
                              title="持仓明细"
                              headers={["名称", "代码", "份额", "市值"]}
                              rows={a.extracted.holdings
                                .slice(0, 8)
                                .map((h) => [
                                  h.name,
                                  h.code ?? "—",
                                  h.shares != null ? String(h.shares) : "—",
                                  fmtMoney(h.marketValue),
                                ])}
                              more={a.extracted.holdings.length - 8}
                            />
                          )}
                          {a.extracted.transactions.length > 0 && (
                            <PreviewTable
                              title="交易明细"
                              headers={["日期", "描述", "分类", "金额"]}
                              rows={a.extracted.transactions
                                .slice(0, 8)
                                .map((t) => [
                                  t.date,
                                  t.description || t.merchant,
                                  t.category,
                                  `${t.amount >= 0 ? "+" : ""}${t.amount.toLocaleString("zh-CN")}`,
                                ])}
                              more={a.extracted.transactions.length - 8}
                            />
                          )}
                          {a.extracted.policies.length > 0 && (
                            <PreviewTable
                              title="保险合同"
                              headers={["保险公司", "产品", "险种", "年缴保费"]}
                              rows={a.extracted.policies.map((p) => [
                                p.insurer || "—",
                                p.productName || "—",
                                p.policyType || "—",
                                p.premium != null ? fmtMoney(p.premium) : "—",
                              ])}
                            />
                          )}

                          {/* 告警 */}
                          {a.warnings.length > 0 && (
                            <div className="space-y-1">
                              {a.warnings.slice(0, 3).map((w, i) => (
                                <div
                                  key={i}
                                  className="text-xs text-amber-400/90"
                                >
                                  · {w}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 确认提示 */}
                          {a.status === "needs_confirm" && (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                              以上为 AI 识别结果，尚未写入您的财富画像。请核对无误后点击「确认写入」。
                            </div>
                          )}
                          {a.status === "confirmed" && (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
                              已写入财富画像，数字分身已更新
                              {a.appliedAt
                                ? `（${new Date(a.appliedAt).toLocaleString("zh-CN", { hour12: false })}）`
                                : ""}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 操作 */}
                      <div className="mt-4 flex items-center gap-2">
                        {a.status === "needs_confirm" && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleConfirm(doc.id)}
                          >
                            {busy ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            )}
                            确认写入财富画像
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleReanalyze(doc.id)}
                        >
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          重新分析
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => void handleDelete(doc.id)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

/* ------------------------------- 子组件 ------------------------------- */

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const low = value < 80;
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        low
          ? "border-amber-500/30 bg-amber-500/5 text-amber-400"
          : "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
      }`}
    >
      <span className="text-muted-foreground">数据可信度</span>
      <span className="font-semibold">{value}%</span>
      {low ? (
        <span>· 可信度偏低，请重点核对金额与分类后再确认写入</span>
      ) : (
        <span>· 识别结果较可靠，确认前仍请简单核对</span>
      )}
    </div>
  );
}

function PreviewTable({
  title,
  headers,
  rows,
  more = 0,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  more?: number;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60 bg-secondary/40 text-left text-muted-foreground">
              {headers.map((h) => (
                <th key={h} className="px-3 py-1.5 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/40 last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          还有 {more} 条，确认写入后可在金融数据中心查看全部
        </div>
      )}
    </div>
  );
}
