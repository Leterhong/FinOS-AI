"use client";

// ── 金融数据源设置（Phase 6.9 · #274）──────────────────────────────────────
// 仿 AI 模型中心：用户自主配置行情数据源（API 地址 / API Key / 来源名称）。
// 系统不默认绑定任何平台 —— 不配置则没有行情（绝不伪造，需求三 / 十四）。
// API Key AES-256-GCM 加密存储，前端只展示掩码。

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import GradientText from "@/components/ui/GradientText";
import { Badge } from "@/components/ui/badge";
import { useFinancialStore } from "@/store/financial-store";
import { FINANCE_PROVIDER_PRESETS } from "@/finance/providers/presets";
import type {
  FinanceProviderKind,
  FinanceSourceStatus,
  PublicFinanceSource,
} from "@/finance/types";
import {
  Database,
  Plus,
  Plug,
  Pencil,
  Trash2,
  Star,
  Loader2,
  ShieldCheck,
  X,
  AlertTriangle,
  LineChart,
  PiggyBank,
  Building2,
  FileSpreadsheet,
} from "lucide-react";

const STATUS_META: Record<
  FinanceSourceStatus,
  { label: string; color: string; dot: string }
> = {
  online: { label: "在线", color: "text-semantic-success", dot: "bg-semantic-success" },
  error: { label: "错误", color: "text-semantic-risk", dot: "bg-semantic-risk" },
  untested: { label: "未测试", color: "text-white/40", dot: "bg-white/30" },
};

const CAP_LABELS: Array<[keyof (typeof FINANCE_PROVIDER_PRESETS)[0]["capabilities"], string]> = [
  ["stock", "股票"],
  ["fund", "基金"],
  ["index", "指数"],
  ["history", "历史"],
  ["news", "新闻"],
];

export default function FinanceDataSourcesPage() {
  const sources = useFinancialStore((s) => s.financeSources);
  const loadFinanceSources = useFinancialStore((s) => s.loadFinanceSources);
  const deleteFinanceSource = useFinancialStore((s) => s.deleteFinanceSource);
  const setDefaultFinanceSource = useFinancialStore((s) => s.setDefaultFinanceSource);
  const testFinanceSource = useFinancialStore((s) => s.testFinanceSource);
  const currentUserId = useFinancialStore((s) => s.currentUserId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PublicFinanceSource | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    void loadFinanceSources().finally(() => setLoaded(true));
  }, [currentUserId, loadFinanceSources]);

  const hasSources = sources.length > 0;

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(s: PublicFinanceSource) {
    setEditing(s);
    setDialogOpen(true);
  }
  async function handleDelete(s: PublicFinanceSource) {
    if (confirm(`确定删除数据源「${s.name}」？删除后相关行情能力将不可用。`)) {
      await deleteFinanceSource(s.id);
    }
  }
  async function handleTest(id: string) {
    setTestingId(id);
    try {
      await testFinanceSource(id);
    } finally {
      setTestingId(null);
    }
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-3 flex items-center gap-3">
            <Badge variant="outline" className="text-[11px]">
              <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-brand-electric" />
              Provider Adapter
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {sources.length} 个数据源
            </Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            <GradientText>金融数据源</GradientText>
          </h1>
          <p className="mt-2 font-light text-white/60">
            接入你选择的行情来源，投资中心与财富监控的所有价格均取自这些真实接口。
          </p>
        </motion.div>

        {/* 数据源列表 */}
        <GlassCard className="p-5" glow>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
                <Database className="h-5 w-5 text-white" />
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40">
                  My Data Sources
                </p>
                <h2 className="text-lg font-semibold text-white">我的数据源</h2>
              </div>
            </div>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-blue"
            >
              <Plus className="h-4 w-4" />
              添加数据源
            </button>
          </div>

          {!loaded ? (
            <div className="flex items-center justify-center gap-2 py-10 text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
            </div>
          ) : !hasSources ? (
            <EmptySources onAdd={openAdd} />
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] uppercase tracking-wider text-white/30">
                <div className="col-span-4">数据来源名称</div>
                <div className="col-span-2">能力</div>
                <div className="col-span-2">状态</div>
                <div className="col-span-1">默认</div>
                <div className="col-span-3 text-right">操作</div>
              </div>
              {sources.map((s) => {
                const meta = STATUS_META[s.status];
                const preset = FINANCE_PROVIDER_PRESETS.find((p) => p.kind === s.kind);
                const testing = testingId === s.id;
                return (
                  <div
                    key={s.id}
                    className="grid grid-cols-12 items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-3 transition-colors hover:bg-white/[0.05]"
                  >
                    <div className="col-span-4 min-w-0">
                      <p className="truncate text-sm font-medium text-white">{s.name}</p>
                      <p className="truncate font-mono text-[11px] text-white/40">
                        {preset?.label ?? s.kind}
                        {s.baseUrl ? ` · ${s.baseUrl}` : ""}
                        {s.keyMask !== "—" ? ` · ${s.keyMask}` : ""}
                      </p>
                    </div>
                    <div className="col-span-2 flex flex-wrap gap-1">
                      {preset &&
                        CAP_LABELS.filter(([k]) => preset.capabilities[k]).map(([k, label]) => (
                          <span
                            key={k}
                            className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/55"
                          >
                            {label}
                          </span>
                        ))}
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      <span className={`text-xs ${meta.color}`}>{meta.label}</span>
                      {s.lastLatencyMs != null && s.status === "online" && (
                        <span className="text-[11px] text-white/30">{s.lastLatencyMs}ms</span>
                      )}
                    </div>
                    <div className="col-span-1">
                      {s.isDefault ? (
                        <Star className="h-4 w-4 fill-semantic-warn text-semantic-warn" />
                      ) : (
                        <button
                          onClick={() => setDefaultFinanceSource(s.id)}
                          title="设为默认"
                          className="text-white/30 hover:text-semantic-warn"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="col-span-3 flex items-center justify-end gap-1.5">
                      <IconBtn onClick={() => handleTest(s.id)} title="测试连接" busy={testing}>
                        <Plug className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn onClick={() => openEdit(s)} title="编辑">
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn onClick={() => handleDelete(s)} title="删除" danger>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 错误信息展示 */}
          {sources.some((s) => s.status === "error" && s.lastError) && (
            <div className="mt-3 space-y-1.5">
              {sources
                .filter((s) => s.status === "error" && s.lastError)
                .map((s) => (
                  <p
                    key={s.id}
                    className="flex items-start gap-1.5 rounded-lg bg-semantic-risk/10 px-3 py-2 text-xs text-semantic-risk"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {s.name}：{s.lastError}
                  </p>
                ))}
            </div>
          )}
        </GlassCard>

        {/* Phase 7.5 #365：加密细节统一在「数据控制中心」说明，此处仅保留一行入口，不重复长文 */}
        <p className="flex items-center gap-1.5 text-[11px] text-white/30">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-semantic-success/60" />
          API Key 加密存储并按用户隔离，
          <Link
            href="/privacy-center"
            className="text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
          >
            查看数据控制中心
          </Link>
        </p>
      </div>

      <SourceFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
      />
    </PageTransition>
  );
}

// ── 添加 / 编辑数据源弹窗 ────────────────────────────────────────────────────

function SourceFormDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: PublicFinanceSource | null;
}) {
  const addFinanceSource = useFinancialStore((s) => s.addFinanceSource);
  const updateFinanceSource = useFinancialStore((s) => s.updateFinanceSource);

  const [kind, setKind] = useState<FinanceProviderKind>("tencent-quote");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const preset = useMemo(
    () => FINANCE_PROVIDER_PRESETS.find((p) => p.kind === kind),
    [kind],
  );

  // 打开时同步编辑态
  useEffect(() => {
    if (!open) return;
    setError(null);
    setApiKey("");
    if (editing) {
      setKind(editing.kind);
      setName(editing.name);
      setBaseUrl(editing.baseUrl ?? "");
    } else {
      setKind("tencent-quote");
      setName("");
      setBaseUrl("");
    }
  }, [open, editing]);

  if (!open) return null;

  async function handleSubmit() {
    setError(null);
    if (kind === "custom" && !baseUrl.trim() && !editing?.baseUrl) {
      setError("自定义数据源必须填写 API 地址");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        kind,
        name: name.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      };
      const res = editing
        ? await updateFinanceSource(editing.id, payload)
        : await addFinanceSource(payload);
      if (!res.ok) {
        setError(res.error ?? "保存失败");
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {editing ? "编辑数据源" : "添加金融数据源"}
          </h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 类型选择 */}
          {!editing && (
            <div>
              <label className="mb-2 block text-xs text-white/50">数据源类型</label>
              <div className="grid gap-2">
                {FINANCE_PROVIDER_PRESETS.map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => setKind(p.kind)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      kind === p.kind
                        ? "border-brand-electric/50 bg-brand-electric/10"
                        : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <p className="text-sm font-medium text-white">{p.label}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">
                      {p.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 名称 */}
          <div>
            <label className="mb-1.5 block text-xs text-white/50">
              数据来源名称（选填，默认使用预设名）
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={preset?.label ?? "自定义名称"}
              className="w-full rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-brand-electric/50"
            />
          </div>

          {/* API 地址 */}
          <div>
            <label className="mb-1.5 block text-xs text-white/50">
              API 地址{kind === "custom" ? "（必填）" : "（选填，留空使用官方默认）"}
            </label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={preset?.defaultBaseUrl ?? "https://your-market-api.example.com"}
              className="w-full rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5 font-mono text-sm text-white outline-none placeholder:text-white/25 focus:border-brand-electric/50"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-xs text-white/50">
              API Key
              {preset?.needsKey
                ? editing
                  ? `（当前 ${editing.keyMask}，留空则不修改）`
                  : "（必要时填写）"
                : "（此数据源为公开接口，无需 Key）"}
            </label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              disabled={!preset?.needsKey}
              placeholder={preset?.needsKey ? "sk-…" : "无需填写"}
              className="w-full rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5 font-mono text-sm text-white outline-none placeholder:text-white/25 focus:border-brand-electric/50 disabled:opacity-40"
            />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-semantic-risk/10 px-3 py-2 text-xs text-semantic-risk">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-blue disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "保存修改" : "添加数据源"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── 小组件 ──────────────────────────────────────────────────────────────────

function IconBtn({
  children,
  onClick,
  title,
  danger,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={busy}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] transition-colors ${
        danger ? "text-white/40 hover:text-semantic-risk" : "text-white/50 hover:text-white"
      } hover:bg-white/[0.08]`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}

/**
 * Phase 7.5 #363：空状态由「一段文字」升级为可操作的接入引导。
 * 只列出系统真实支持的接入方式，不承诺未实现的能力，也不填充任何模拟行情。
 */
const CONNECT_CHANNELS: {
  icon: typeof LineChart;
  title: string;
  desc: string;
  action: "dialog" | "link";
  href?: string;
}[] = [
  {
    icon: LineChart,
    title: "股票行情接口",
    desc: "A股 / 港股 / 美股实时报价与 K 线（腾讯行情公开接口）",
    action: "dialog",
  },
  {
    icon: PiggyBank,
    title: "基金净值数据",
    desc: "公募基金单位净值与估值涨跌（天天基金公开接口）",
    action: "dialog",
  },
  {
    icon: Building2,
    title: "银行 / 自建 API",
    desc: "接入你自己的 REST 行情或账户服务，Bearer Token 鉴权",
    action: "dialog",
  },
  {
    icon: FileSpreadsheet,
    title: "CSV 账单导入",
    desc: "在金融数据中心上传银行流水 CSV，解析为真实交易记录",
    action: "link",
    href: "/data",
  },
];

function EmptySources({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="py-8">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04]">
          <Database className="h-6 w-6 text-white/40" />
        </span>
        <p className="mt-4 text-base font-semibold text-white">
          尚未连接金融数据源
        </p>
        <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-white/45">
          FinOS AI 不默认绑定任何平台，也不会生成模拟行情。
          连接数据源后，投资中心与财富监控才会显示真实价格与净值。
        </p>
        <button
          onClick={onAdd}
          className="mt-5 flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-blue transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> 添加数据源
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CONNECT_CHANNELS.map((c) => {
          const Icon = c.icon;
          const inner = (
            <>
              <Icon className="h-4 w-4 text-white/45 transition-colors group-hover:text-semantic-success" />
              <p className="mt-2.5 text-[13px] font-medium text-white/90">
                {c.title}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-white/35">
                {c.desc}
              </p>
            </>
          );
          const cls =
            "group rounded-xl border border-white/8 bg-white/[0.02] p-3.5 text-left transition-colors hover:border-semantic-success/25 hover:bg-white/[0.05]";
          return c.action === "link" && c.href ? (
            <Link key={c.title} href={c.href} className={cls}>
              {inner}
            </Link>
          ) : (
            <button key={c.title} type="button" onClick={onAdd} className={cls}>
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
