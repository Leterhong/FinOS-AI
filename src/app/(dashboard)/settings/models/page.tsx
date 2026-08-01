"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import GradientText from "@/components/ui/GradientText";
import { Badge } from "@/components/ui/badge";
import ModelFormDialog from "@/components/models/ModelFormDialog";
import { useModelStore } from "@/store/model-store";
import { PROVIDER_PRESETS } from "@/ai/model-center/providers/presets";
import type { ModelStatus, PublicProviderConfig } from "@/ai/model-center/types";
import {
  Cpu,
  Plus,
  Plug,
  Pencil,
  Trash2,
  Star,
  Loader2,
  Activity,
  Zap,
  ShieldCheck,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

const STATUS_META: Record<ModelStatus, { label: string; color: string; dot: string }> = {
  online: { label: "在线", color: "text-semantic-success", dot: "bg-semantic-success" },
  offline: { label: "离线", color: "text-white/40", dot: "bg-white/30" },
  error: { label: "错误", color: "text-semantic-risk", dot: "bg-semantic-risk" },
  untested: { label: "未测试", color: "text-white/40", dot: "bg-white/30" },
};

export default function ModelCenterPage() {
  const models = useModelStore((s) => s.models);
  const active = useModelStore((s) => s.active);
  const health = useModelStore((s) => s.health);
  const isLoading = useModelStore((s) => s.isLoading);
  const isTesting = useModelStore((s) => s.isTesting);
  const loadModels = useModelStore((s) => s.loadModels);
  const loadActive = useModelStore((s) => s.loadActive);
  const testModel = useModelStore((s) => s.testModel);
  const setDefaultModel = useModelStore((s) => s.setDefaultModel);
  const deleteModel = useModelStore((s) => s.deleteModel);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PublicProviderConfig | null>(null);

  useEffect(() => {
    loadModels();
    loadActive();
  }, [loadModels, loadActive]);

  const hasModels = models.length > 0;

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(m: PublicProviderConfig) {
    setEditing(m);
    setDialogOpen(true);
  }
  async function handleDelete(m: PublicProviderConfig) {
    if (confirm(`确定删除模型「${m.displayName}」？删除默认模型后将自动回退到其它模型。`)) {
      await deleteModel(m.id);
      await loadActive();
    }
  }
  async function handleSetDefault(id: string) {
    await setDefaultModel(id);
    await loadActive();
  }
  async function handleTest(id: string) {
    await testModel(id);
    await loadActive();
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
          <div className="flex items-center gap-3 mb-3">
            <Badge variant="purple" className="text-[11px]">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-brand-purple animate-pulse" />
              Model-Agnostic Platform
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {models.length} 个模型
            </Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            <GradientText>AI 模型中心</GradientText>
          </h1>
          <p className="mt-2 text-white/60 font-light">
            FinOS AI 不绑定任何官方模型 —— 接入你自己的 AI API，掌握模型选择权、数据控制权与成本控制权。
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-12 gap-5">
          {/* 当前模型 */}
          <div className="col-span-12 lg:col-span-4">
            <CurrentModelCard
              active={active}
              onAdd={openAdd}
            />
          </div>

          {/* Playground */}
          <div className="col-span-12 lg:col-span-8">
            <PlaygroundCard configured={active?.configured ?? false} />
          </div>

          {/* 我的模型列表 */}
          <div className="col-span-12">
            <GlassCard className="p-5" glow>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-purple">
                    <Cpu className="h-5 w-5 text-white" />
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40">
                      My Models
                    </p>
                    <h2 className="text-lg font-semibold text-white">我的模型</h2>
                  </div>
                </div>
                <button
                  onClick={openAdd}
                  className="flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-blue"
                >
                  <Plus className="h-4 w-4" />
                  添加 AI 模型
                </button>
              </div>

              {isLoading ? (
                <div className="flex items-center gap-2 py-10 justify-center text-white/40">
                  <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                </div>
              ) : !hasModels ? (
                <EmptyState onAdd={openAdd} />
              ) : (
                <div className="space-y-2">
                  {/* 表头 */}
                  <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] uppercase tracking-wider text-white/30">
                    <div className="col-span-4">模型名称</div>
                    <div className="col-span-2">类型</div>
                    <div className="col-span-2">状态</div>
                    <div className="col-span-1">默认</div>
                    <div className="col-span-3 text-right">操作</div>
                  </div>
                  {models.map((m) => {
                    const meta = STATUS_META[m.status];
                    const testing = isTesting === m.id;
                    return (
                      <div
                        key={m.id}
                        className="grid grid-cols-12 gap-3 items-center rounded-xl bg-white/[0.03] px-3 py-3 hover:bg-white/[0.05] transition-colors"
                      >
                        <div className="col-span-4 min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {m.displayName}
                          </p>
                          <p className="truncate text-[11px] text-white/40 font-mono">
                            {m.modelId} · {m.keyMask}
                          </p>
                        </div>
                        <div className="col-span-2 text-sm text-white/60">
                          {PROVIDER_PRESETS[m.providerType]?.label ?? m.providerType}
                        </div>
                        <div className="col-span-2 flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                          <span className={`text-xs ${meta.color}`}>{meta.label}</span>
                          {m.lastLatencyMs != null && m.status === "online" && (
                            <span className="text-[11px] text-white/30">{m.lastLatencyMs}ms</span>
                          )}
                        </div>
                        <div className="col-span-1">
                          {m.isDefault ? (
                            <Star className="h-4 w-4 fill-semantic-warn text-semantic-warn" />
                          ) : (
                            <button
                              onClick={() => handleSetDefault(m.id)}
                              title="设为默认"
                              className="text-white/30 hover:text-semantic-warn"
                            >
                              <Star className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div className="col-span-3 flex items-center justify-end gap-1.5">
                          <IconBtn onClick={() => handleTest(m.id)} title="测试连接" busy={testing}>
                            <Plug className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn onClick={() => openEdit(m)} title="编辑">
                            <Pencil className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn onClick={() => handleDelete(m)} title="删除" danger>
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          </div>

          {/* 健康监控 */}
          {hasModels && (
            <div className="col-span-12">
              <HealthCard health={health} />
            </div>
          )}
        </div>
      </div>

      <ModelFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
      />
    </PageTransition>
  );
}

// ── 当前模型卡 ──────────────────────────────────────────────────────────────

function CurrentModelCard({
  active,
  onAdd,
}: {
  active: ReturnType<typeof useModelStore.getState>["active"];
  onAdd: () => void;
}) {
  const configured = active?.configured ?? false;
  const meta = active?.status ? STATUS_META[active.status] : STATUS_META.untested;
  return (
    <GlassCard className="p-5 h-full" glow>
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
          <ShieldCheck className="h-5 w-5 text-white" />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">Current Model</p>
          <h2 className="text-lg font-semibold text-white">当前 AI CFO 模型</h2>
        </div>
      </div>

      {configured ? (
        <div className="space-y-4">
          <div>
            <p className="text-2xl font-bold text-white">{active?.modelName}</p>
            <p className="text-sm text-white/50">{active?.displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${meta.dot} animate-pulse`} />
            <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
            {active?.latencyMs != null && (
              <span className="ml-auto flex items-center gap-1 text-xs text-white/40">
                <Zap className="h-3 w-3" /> {active.latencyMs}ms
              </span>
            )}
          </div>
          <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-white/50">
            Provider：{active?.providerType ? PROVIDER_PRESETS[active.providerType]?.label : "—"}
          </div>
          <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-white/50">
            参数：温度 {active?.temperature ?? 0.7} · Max Tokens {active?.maxTokens ?? 4096}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl bg-semantic-warn/10 px-3 py-3 text-sm text-semantic-warn">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>尚未连接任何 AI 模型。所有 AI 功能（对话 / Agent / 分析）在配置前不可用。</span>
          </div>
          <button
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-blue"
          >
            <Plus className="h-4 w-4" /> 连接 AI 模型
          </button>
        </div>
      )}
    </GlassCard>
  );
}

// ── Playground 卡 ──────────────────────────────────────────────────────────

function PlaygroundCard({ configured }: { configured: boolean }) {
  const runPlayground = useModelStore((s) => s.runPlayground);
  const result = useModelStore((s) => s.playgroundResult);
  const running = useModelStore((s) => s.isPlaygroundRunning);
  const [q, setQ] = useState("分析我的退休计划");

  return (
    <GlassCard className="p-5 h-full" glow>
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-purple">
          <Activity className="h-5 w-5 text-white" />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">Model Playground</p>
          <h2 className="text-lg font-semibold text-white">模型测试中心</h2>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="输入测试问题，如：分析我的退休计划"
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim() && configured && !running) runPlayground(q);
          }}
          className="flex-1 rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-electric/50 placeholder:text-white/25"
        />
        <button
          onClick={() => runPlayground(q)}
          disabled={!configured || running || !q.trim()}
          className="flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-blue disabled:opacity-40"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          运行
        </button>
      </div>

      {!configured && (
        <p className="mt-3 text-xs text-semantic-warn">请先连接并设为默认一个模型后再运行测试。</p>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {result.ok ? (
              <span className="flex items-center gap-1 text-semantic-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> 成功
              </span>
            ) : (
              <span className="flex items-center gap-1 text-semantic-risk">
                <XCircle className="h-3.5 w-3.5" /> 失败
              </span>
            )}
            {result.ok && (
              <>
                <Chip label="耗时" value={`${result.latencyMs}ms`} />
                <Chip label="Token" value={`${result.totalTokens}`} />
                <Chip label="模型" value={result.model} />
              </>
            )}
          </div>
          <div
            className={`rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
              result.ok
                ? "bg-white/[0.03] text-white/80"
                : "bg-semantic-risk/10 text-semantic-risk"
            }`}
          >
            {result.ok ? result.reply || "（空回复）" : result.error}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ── 健康监控卡 ──────────────────────────────────────────────────────────────

function HealthCard({
  health,
}: {
  health: ReturnType<typeof useModelStore.getState>["health"];
}) {
  return (
    <GlassCard className="p-5" glow>
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
          <Activity className="h-5 w-5 text-white" />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">Health Monitor</p>
          <h2 className="text-lg font-semibold text-white">模型健康监控</h2>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {health.map((h) => {
          const meta = STATUS_META[h.status];
          return (
            <div key={h.id} className="rounded-xl bg-white/[0.03] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="truncate text-sm font-medium text-white">{h.displayName}</span>
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label="状态" value={meta.label} />
                <Metric label="响应" value={h.latencyMs != null ? `${h.latencyMs}ms` : "—"} />
                <Metric label="错误率" value={`${(h.errorRate * 100).toFixed(0)}%`} />
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04]">
        <Cpu className="h-6 w-6 text-white/40" />
      </span>
      <div>
        <p className="text-white font-medium">还没有连接任何 AI 模型</p>
        <p className="mt-1 text-sm text-white/40">
          添加 OpenAI / DeepSeek / Qwen / Claude / Ollama 等模型，即可启用全部 AI 能力。
        </p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-blue"
      >
        <Plus className="h-4 w-4" /> 添加第一个模型
      </button>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-white/[0.04] px-2 py-1 text-white/50">
      {label} <span className="text-white/80 font-medium">{value}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-white/30">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
    </div>
  );
}
