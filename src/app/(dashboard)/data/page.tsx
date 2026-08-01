"use client";

// ── Financial Data Center（Phase 6.3 · #219）────────────────────────────────
// 数据中心页：导入 6 类金融数据（银行流水 / 信用卡 / 基金 / 股票 / 工资 / 保险 PDF），
// 手动添加现金 / 股票 / 基金等资产，并管理 AI 数据授权（作用域开关 + 审计日志）。
// 所有数据加密存储、用户隔离。

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GradientText from "@/components/ui/GradientText";
import GlassCard from "@/components/ui/GlassCard";
import { useFinancialStore } from "@/store/financial-store";
import { CONNECTORS } from "@/financial-data/connectors";
import type { ImportSource, HoldingType } from "@/financial-data/types";
import { HOLDING_TYPE_LABELS } from "@/financial-data/types";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Database,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Landmark,
  CreditCard,
  LineChart,
  Banknote,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Lock,
  Plus,
  Trash2,
  ScrollText,
  Wallet,
  Coins,
} from "lucide-react";

const SOURCE_ICONS: Record<ImportSource, React.ReactNode> = {
  "bank-csv": <Landmark className="h-5 w-5" />,
  "credit-card": <CreditCard className="h-5 w-5" />,
  fund: <LineChart className="h-5 w-5" />,
  stock: <TrendingUp className="h-5 w-5" />,
  salary: <Banknote className="h-5 w-5" />,
  "insurance-pdf": <ShieldCheck className="h-5 w-5" />,
  manual: <Database className="h-5 w-5" />,
  api: <RefreshCw className="h-5 w-5" />,
};

// ── Data Permission Layer 前端类型（不从 server-only 模块导入）──
type DataScope = "cashflow" | "investments" | "assets" | "insurance";
type ConsentScopes = Record<DataScope, boolean>;
type ScopeLabels = Record<DataScope, string>;
interface AuditEntry {
  at: string;
  accessor: string;
  purpose: string;
  scopes: DataScope[];
  deniedScopes: DataScope[];
}

// ── 手动资产表单（input 以字符串存储，提交时解析）──
interface AssetFormState {
  name: string;
  type: HoldingType;
  code: string;
  shares: string;
  cost: string;
  marketValue: string;
  totalCost: string;
}

export default function DataCenterPage() {
  const currentUserId = useFinancialStore((s) => s.currentUserId);
  const summary = useFinancialStore((s) => s.financialSummary);
  const recentTransactions = useFinancialStore((s) => s.recentTransactions);
  const dataHoldings = useFinancialStore((s) => s.dataHoldings);
  const insights = useFinancialStore((s) => s.financialInsights);
  const isImportingData = useFinancialStore((s) => s.isImportingData);
  const isLoadingInsights = useFinancialStore((s) => s.isLoadingInsights);
  const lastImportResult = useFinancialStore((s) => s.lastImportResult);
  const importData = useFinancialStore((s) => s.importData);
  const loadFinancialData = useFinancialStore((s) => s.loadFinancialData);
  const loadUserProfile = useFinancialStore((s) => s.loadUserProfile);
  const refreshData = useFinancialStore((s) => s.refreshData);

  const [activeSource, setActiveSource] = useState<ImportSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 手动资产表单状态
  const [manualOpen, setManualOpen] = useState(false);
  const [form, setForm] = useState<AssetFormState>({
    name: "",
    type: "cash",
    code: "",
    shares: "",
    cost: "",
    marketValue: "",
    totalCost: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [savingAsset, setSavingAsset] = useState(false);

  // 数据授权（consent）状态
  const [consent, setConsent] = useState<ConsentScopes | null>(null);
  const [consentLabels, setConsentLabels] = useState<ScopeLabels | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentSaving, setConsentSaving] = useState<DataScope | null>(null);

  // Phase 5.6：依赖 layout 写入的 currentUserId 加载当前用户的真实金融数据（隔离）
  useEffect(() => {
    if (currentUserId) {
      loadFinancialData(currentUserId);
      loadConsent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const loadConsent = useCallback(async () => {
    if (!currentUserId) return;
    setConsentLoading(true);
    try {
      const res = await fetch("/api/financial-data/consent");
      const data = (await res.json()) as {
        ok: boolean;
        scopes?: ConsentScopes;
        labels?: ScopeLabels;
        auditLog?: AuditEntry[];
      };
      if (data.ok) {
        setConsent(data.scopes ?? null);
        setConsentLabels(data.labels ?? null);
        setAuditLog(data.auditLog ?? []);
      }
    } catch {
      /* 忽略：授权设置不影响数据展示 */
    } finally {
      setConsentLoading(false);
    }
  }, [currentUserId]);

  const pickFile = useCallback((source: ImportSource) => {
    setActiveSource(source);
    const spec = CONNECTORS.find((c) => c.source === source);
    if (fileInputRef.current && spec) {
      fileInputRef.current.accept = spec.accept;
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeSource) return;

      const isBinary = /\.(xlsx|pdf)$/i.test(file.name);
      let content: string;
      let encoding: "utf8" | "base64";
      if (isBinary) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        content = btoa(bin);
        encoding = "base64";
      } else {
        content = await file.text();
        encoding = "utf8";
      }

      await importData({ source: activeSource, fileName: file.name, content, encoding });
    },
    [activeSource, importData],
  );

  // ── 手动添加资产 ──
  const submitManualAsset = useCallback(async () => {
    if (!form.name.trim()) {
      setFormError("请填写资产名称");
      return;
    }
    const marketValue = Number(form.marketValue);
    if (!Number.isFinite(marketValue) || marketValue < 0) {
      setFormError("请填写有效的当前价值（≥ 0）");
      return;
    }
    setSavingAsset(true);
    setFormError(null);
    try {
      const res = await fetch("/api/financial-data/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          code: form.code.trim() || undefined,
          shares:
            form.shares.trim() && Number.isFinite(Number(form.shares))
              ? Number(form.shares)
              : undefined,
          cost:
            form.cost.trim() && Number.isFinite(Number(form.cost))
              ? Number(form.cost)
              : undefined,
          marketValue,
          totalCost:
            form.totalCost.trim() && Number.isFinite(Number(form.totalCost))
              ? Number(form.totalCost)
              : undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setFormError(data.error || "添加失败");
        return;
      }
      // 刷新持仓列表 + Financial Twin（服务端已重建）
      await loadFinancialData(currentUserId);
      await loadUserProfile(currentUserId, true);
      setManualOpen(false);
      setForm({
        name: "",
        type: "cash",
        code: "",
        shares: "",
        cost: "",
        marketValue: "",
        totalCost: "",
      });
    } catch {
      setFormError("网络错误，请重试");
    } finally {
      setSavingAsset(false);
    }
  }, [form, currentUserId, loadFinancialData, loadUserProfile]);

  const deleteHolding = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(
          `/api/financial-data/assets?id=${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) return;
        await loadFinancialData(currentUserId);
        await loadUserProfile(currentUserId, true);
      } catch {
        /* 忽略网络错误 */
      }
    },
    [currentUserId, loadFinancialData, loadUserProfile],
  );

  // ── 数据授权开关 ──
  const toggleConsent = useCallback(
    async (scope: DataScope) => {
      if (!consent) return;
      const next = !consent[scope];
      setConsent((c) => (c ? { ...c, [scope]: next } : c)); // 乐观更新
      setConsentSaving(scope);
      try {
        const res = await fetch("/api/financial-data/consent", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [scope]: next }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          scopes?: ConsentScopes;
          auditLog?: AuditEntry[];
        };
        if (data.ok) {
          if (data.scopes) setConsent(data.scopes);
          if (data.auditLog) setAuditLog(data.auditLog);
        } else {
          setConsent((c) => (c ? { ...c, [scope]: !next } : c)); // 回滚
        }
      } catch {
        setConsent((c) => (c ? { ...c, [scope]: !next } : c)); // 回滚
      } finally {
        setConsentSaving(null);
      }
    },
    [consent],
  );

  const consentScopes = Object.keys(consent ?? {}) as DataScope[];

  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* 页头 */}
        <div className="flex items-end justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/40">
              <Database className="h-3.5 w-3.5" /> Real Financial Data OS
            </div>
            <h1 className="text-2xl font-bold text-white">
              <GradientText>金融数据中心</GradientText>
            </h1>
            <p className="mt-1 text-sm text-white/45">
              导入真实金融数据，AI 自动解析、分类并驱动你的财富数字孪生
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-lg bg-emerald-400/10 px-3 py-1.5 text-[11px] text-emerald-300 ring-1 ring-emerald-400/20">
              <Lock className="h-3 w-3" /> AES-256 加密 · 用户隔离
            </span>
            <button
              onClick={() => refreshData()}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] text-white/70 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <RefreshCw className="h-3 w-3" /> 数据刷新
            </button>
          </div>
        </div>

        {/* 隐藏文件输入 */}
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />

        {/* 导入结果提示 */}
        {lastImportResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-2 rounded-xl p-3 text-xs ring-1 ${
              lastImportResult.ok
                ? "bg-emerald-400/10 text-emerald-200 ring-emerald-400/20"
                : "bg-red-400/10 text-red-200 ring-red-400/20"
            }`}
          >
            {lastImportResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              {lastImportResult.ok ? (
                <>
                  <p className="font-semibold">
                    导入成功：{lastImportResult.batch?.fileName}
                  </p>
                  <p className="mt-0.5 opacity-80">
                    新增交易 {lastImportResult.batch?.transactionCount ?? 0} 笔 · 持仓{" "}
                    {lastImportResult.batch?.holdingCount ?? 0} 条 · 保单{" "}
                    {lastImportResult.batch?.policyCount ?? 0} 份，Financial Twin 已自动重建
                  </p>
                  {(lastImportResult.meta?.warnings?.length ?? 0) > 0 && (
                    <p className="mt-0.5 opacity-60">
                      提示：{lastImportResult.meta!.warnings.join("；")}
                    </p>
                  )}
                </>
              ) : (
                <p className="font-semibold">{lastImportResult.error}</p>
              )}
            </div>
          </motion.div>
        )}

        {/* 6 类数据源导入 */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {CONNECTORS.map((c, i) => (
            <motion.button
              key={c.source}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => pickFile(c.source)}
              disabled={isImportingData}
              className="group rounded-2xl bg-white/[0.03] p-4 text-left ring-1 ring-white/10 transition hover:bg-white/[0.06] hover:ring-brand-purple/40 disabled:opacity-50"
            >
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow-purple">
                {isImportingData && activeSource === c.source ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  SOURCE_ICONS[c.source]
                )}
              </span>
              <p className="text-sm font-semibold text-white">{c.label}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-white/40">{c.description}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-brand-purple opacity-0 transition group-hover:opacity-100">
                <Upload className="h-3 w-3" /> 点击上传
              </span>
            </motion.button>
          ))}
        </div>

        {/* ── 手动资产（始终可见，满足「可添加现金 / 股票」验收）── */}
        <GlassCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <Wallet className="h-4 w-4 text-brand-electric" /> 我的资产
              {dataHoldings.length > 0 && (
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40 ring-1 ring-white/10">
                  {dataHoldings.length} 项
                </span>
              )}
            </h3>
            <button
              onClick={() => setManualOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium ring-1 transition",
                manualOpen
                  ? "bg-white/5 text-white/60 ring-white/10 hover:bg-white/10"
                  : "bg-brand-electric/10 text-brand-electric ring-brand-electric/30 hover:bg-brand-electric/20"
              )}
            >
              {manualOpen ? <Coins className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {manualOpen ? "收起" : "添加资产"}
            </button>
          </div>

          {/* 快速预设 + 表单 */}
          {manualOpen && (
            <div className="mb-4 space-y-3 rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/10">
              {/* 快速类型预设 */}
              <div className="flex flex-wrap gap-2">
                {(["cash", "stock", "fund", "bond", "crypto", "realestate"] as HoldingType[]).map(
                  (t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] ring-1 transition",
                        form.type === t
                          ? "bg-brand-electric/15 text-brand-electric ring-brand-electric/40"
                          : "bg-white/[0.03] text-white/50 ring-white/10 hover:text-white/80"
                      )}
                    >
                      {HOLDING_TYPE_LABELS[t]}
                    </button>
                  )
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <label className="col-span-2 md:col-span-1 block">
                  <span className="mb-1 block text-[10px] text-white/40">资产名称 *</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="如：招行活期 / 贵州茅台"
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand-electric/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-white/40">类型</span>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as HoldingType }))}
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-white outline-none ring-1 ring-white/10 focus:ring-brand-electric/40"
                  >
                    {Object.entries(HOLDING_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k} className="bg-[#0e1525]">
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-white/40">代码（可选）</span>
                  <input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="股票 / 基金代码"
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand-electric/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-white/40">当前价值 (¥) *</span>
                  <input
                    type="number"
                    min="0"
                    value={form.marketValue}
                    onChange={(e) => setForm((f) => ({ ...f, marketValue: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand-electric/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-white/40">持有份额（可选）</span>
                  <input
                    type="number"
                    min="0"
                    value={form.shares}
                    onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
                    placeholder="股 / 份"
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand-electric/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-white/40">单位成本（可选）</span>
                  <input
                    type="number"
                    min="0"
                    value={form.cost}
                    onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                    placeholder="每股 / 份成本"
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand-electric/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-white/40">累计成本（可选）</span>
                  <input
                    type="number"
                    min="0"
                    value={form.totalCost}
                    onChange={(e) => setForm((f) => ({ ...f, totalCost: e.target.value }))}
                    placeholder="自动算盈亏"
                    className="w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-white placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-brand-electric/40"
                  />
                </label>
              </div>

              {formError && (
                <p className="text-[11px] text-red-300">{formError}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={submitManualAsset}
                  disabled={savingAsset}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-electric/15 px-4 py-2 text-xs font-medium text-brand-electric ring-1 ring-brand-electric/30 transition hover:bg-brand-electric/25 disabled:opacity-50"
                >
                  {savingAsset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  保存资产
                </button>
                <span className="text-[10px] text-white/30">
                  保存后自动重建 Financial Twin（现金类将计入现金储蓄）
                </span>
              </div>
            </div>
          )}

          {/* 持仓列表 */}
          {dataHoldings.length === 0 ? (
            <p className="text-xs text-white/35">
              还没有资产。点击「添加资产」录入现金 / 股票 / 基金，或从上方导入文件。
            </p>
          ) : (
            <div className="space-y-2">
              {dataHoldings.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 ring-1 ring-white/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs text-white/80">
                      {h.name}
                      <span className="ml-1.5 text-white/30">
                        · {HOLDING_TYPE_LABELS[h.type]}
                        {h.code ? ` · ${h.code}` : ""}
                      </span>
                    </p>
                    <p className="text-[10px] text-white/30">
                      当前价值 {formatCurrency(h.marketValue)}
                      {h.profit != null && (
                        <span className={h.profit >= 0 ? " text-red-400" : " text-emerald-300"}>
                          {" · 盈亏 "}
                          {formatCurrency(h.profit)}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteHolding(h.id)}
                    title="删除资产"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/30 transition hover:bg-red-400/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* 数据概览 + 洞察 */}
        {summary?.hasData && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <GlassCard className="p-5 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                  <FileText className="h-4 w-4 text-brand-electric" /> 最近交易（自动分类）
                </h3>
                <span className="text-[10px] text-white/35">
                  共 {summary.transactionCount} 笔 · {summary.dateRange?.from} ~ {summary.dateRange?.to}
                </span>
              </div>
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {recentTransactions.slice(0, 30).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 ring-1 ring-white/5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/55 ring-1 ring-white/10">
                        {categoryLabel(t.category)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs text-white/80">
                          {t.merchant || t.description || "未知商户"}
                        </p>
                        <p className="text-[10px] text-white/30">
                          {t.date} · {t.classifiedBy === "rule" ? "规则分类" : t.classifiedBy === "llm" ? "AI 分类" : "手动"}
                          {" · 置信度 "}
                          {Math.round(t.confidence * 100)}%
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        t.amount > 0 ? "text-red-400" : "text-white/70"
                      }`}
                    >
                      {t.amount > 0 ? "+" : ""}
                      ¥{Math.abs(t.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <div className="space-y-4">
              {/* 洞察（持仓已上移至「我的资产」卡片） */}
              <GlassCard className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                    <Sparkles className="h-4 w-4 text-amber-300" /> 数据洞察
                  </h3>
                  <ConsentInsightButton />
                </div>
                {insights.length === 0 ? (
                  <p className="text-xs text-white/35">点击生成，AI 从真实数据中发现规律。</p>
                ) : (
                  <div className="space-y-2">
                    {insights.map((ins) => (
                      <div key={ins.id} className="rounded-lg bg-white/[0.03] p-2.5 ring-1 ring-white/5">
                        <p className="text-[11px] font-semibold text-white/85">{ins.title}</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">{ins.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        )}

        {/* 导入历史 */}
        {(summary?.imports.length ?? 0) > 0 && (
          <GlassCard className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <Database className="h-4 w-4 text-white/50" /> 导入历史
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {summary!.imports.map((b) => (
                <div key={b.id} className="rounded-lg bg-white/[0.02] px-3 py-2 text-xs ring-1 ring-white/5">
                  <p className="truncate font-medium text-white/75">{b.fileName}</p>
                  <p className="mt-0.5 text-[10px] text-white/35">
                    {new Date(b.importedAt).toLocaleString("zh-CN")} · 交易 {b.transactionCount} · 持仓{" "}
                    {b.holdingCount} · 保单 {b.policyCount}
                  </p>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* ── 数据授权管理（#220 Data Permission Layer 用户入口）── */}
        <GlassCard className="p-5">
          <div className="mb-1 flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-300" /> 数据授权管理
          </div>
          <p className="mb-4 text-[11px] leading-relaxed text-white/40">
            AI CFO 分析前需读取你的真实数据。以下 4 类作用域默认全部授权（opt-out）；你可随时关闭任意类别，
            关闭后 AI 不会读取该数据，且每次访问都会记录审计日志。
          </p>

          {consentLoading && !consent ? (
            <div className="flex items-center gap-2 text-xs text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载授权设置…
            </div>
          ) : (
            <div className="space-y-2">
              {consentScopes.map((scope) => {
                const on = consent?.[scope] ?? true;
                return (
                  <div
                    key={scope}
                    className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2.5 ring-1 ring-white/5"
                  >
                    <p className="min-w-0 pr-3 text-xs text-white/80">
                      {consentLabels?.[scope] ?? scope}
                    </p>
                    <button
                      onClick={() => toggleConsent(scope)}
                      disabled={consentSaving === scope}
                      className="flex shrink-0 items-center gap-2"
                      title={on ? "点击关闭该数据授权" : "点击重新开启该数据授权"}
                    >
                      <span
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors",
                          on ? "bg-emerald-400/80" : "bg-white/15",
                          consentSaving === scope && "opacity-60"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                            on ? "translate-x-5" : "translate-x-0"
                          )}
                        />
                      </span>
                      <span
                        className={cn(
                          "w-12 text-right text-[10px]",
                          on ? "text-emerald-300" : "text-white/40"
                        )}
                      >
                        {on ? "已授权" : "已关闭"}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 审计日志 */}
          <div className="mt-4 border-t border-white/8 pt-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/50">
              <ScrollText className="h-3.5 w-3.5" /> AI 访问审计（最近 {auditLog.length} 条）
            </h4>
            {auditLog.length === 0 ? (
              <p className="text-[11px] text-white/30">暂无访问记录。当你向 AI CFO 提问并涉及真实数据时会出现在此。</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {auditLog.slice(0, 20).map((e, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-white/[0.02] px-3 py-1.5 text-[10px] text-white/40 ring-1 ring-white/5"
                  >
                    <span className="text-white/55">
                      {new Date(e.at).toLocaleString("zh-CN")}
                    </span>
                    {" · "}
                    <span className="text-white/60">{e.accessor}</span>
                    {" · "}
                    {e.purpose}
                    {e.deniedScopes.length > 0 && (
                      <span className="text-amber-300">
                        {" · 拒绝："}
                        {e.deniedScopes.map((d) => consentLabels?.[d] ?? d).join("、")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

      </div>
    </PageTransition>
  );
}

/** 数据洞察生成按钮（抽取避免破坏既有 store 选择器结构）。 */
function ConsentInsightButton() {
  const runDataInsight = useFinancialStore((s) => s.runDataInsight);
  const isLoadingInsights = useFinancialStore((s) => s.isLoadingInsights);
  return (
    <button
      onClick={() => runDataInsight()}
      disabled={isLoadingInsights}
      className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-[10px] text-white/60 ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-50"
    >
      {isLoadingInsights ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Sparkles className="h-3 w-3" />
      )}
      生成
    </button>
  );
}

const CATEGORY_LABELS_UI: Record<string, string> = {
  dining: "餐饮",
  transport: "交通",
  shopping: "购物",
  rent: "房租房贷",
  utilities: "生活缴费",
  entertainment: "娱乐",
  medical: "医疗",
  education: "教育",
  salary: "工资",
  bonus: "奖金",
  investment: "投资理财",
  insurance: "保险",
  loan: "贷款还款",
  transfer: "转账",
  other: "其他",
};

function categoryLabel(c: string): string {
  return CATEGORY_LABELS_UI[c] ?? c;
}
