"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Cpu,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  Plus,
  ServerCog,
  ShieldCheck,
  Star,
  Trash2,
  Unplug,
  XCircle,
  Zap,
} from "lucide-react";
import { PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import { Button } from "@/components/ui/Button";
import ModelFormDialog from "@/components/models/ModelFormDialog";
import { PROVIDER_PRESETS } from "@/ai/model-center/providers/presets";
import type { PublicProviderConfig } from "@/ai/model-center/types";
import { useModelStore } from "@/store/model-store";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Tooltip } from "@/components/ui/Tooltip";

const statusMeta = {
  online: { label: "连接正常", className: "text-emerald-300", dot: "bg-emerald-400" },
  error: { label: "连接异常", className: "text-rose-300", dot: "bg-rose-400" },
  offline: { label: "离线", className: "text-slate-400", dot: "bg-slate-500" },
  untested: { label: "尚未测试", className: "text-amber-300", dot: "bg-amber-400" },
} as const;

const roleLabels = {
  default: "通用默认",
  chat: "对话",
  reasoning: "复杂研判",
  vision: "图像理解",
  "long-context": "长文档",
} as const;

export default function ModelsPage() {
  const models = useModelStore((state) => state.models);
  const active = useModelStore((state) => state.active);
  const loading = useModelStore((state) => state.isLoading);
  const testing = useModelStore((state) => state.isTesting);
  const error = useModelStore((state) => state.error);
  const playgroundResult = useModelStore((state) => state.playgroundResult);
  const playgroundRunning = useModelStore((state) => state.isPlaygroundRunning);
  const loadModels = useModelStore((state) => state.loadModels);
  const loadActive = useModelStore((state) => state.loadActive);
  const testModel = useModelStore((state) => state.testModel);
  const setDefaultModel = useModelStore((state) => state.setDefaultModel);
  const deleteModel = useModelStore((state) => state.deleteModel);
  const runPlayground = useModelStore((state) => state.runPlayground);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PublicProviderConfig | null>(null);
  const [question, setQuestion] = useState("");

  useEffect(() => {
    void Promise.all([loadModels(), loadActive()]);
  }, [loadActive, loadModels]);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const refresh = async () => {
    await Promise.all([loadModels(), loadActive()]);
  };

  const handleTest = async (id: string) => {
    await testModel(id);
    await refresh();
  };

  const handleDefault = async (id: string) => {
    await setDefaultModel(id);
    await refresh();
  };

  const handleDelete = async (model: PublicProviderConfig) => {
    if (!window.confirm(`确定删除模型「${model.displayName}」？`)) return;
    await deleteModel(model.id);
    await refresh();
  };

  return <div className="page-shell">
    <PageIntro
      eyebrow="Bring your own model"
      title="AI 模型中心"
      description="连接 OpenAI、DeepSeek、通义千问、Claude、Gemini、智谱、Kimi、Ollama 或任意 OpenAI 兼容服务。模型密钥只在服务端加密保存，不会返回浏览器。"
      actions={<Button variant="primary" onClick={openAdd}><Plus className="h-3.5 w-3.5" />添加模型</Button>}
    />

    {error && <ErrorState message={error} onRetry={() => void refresh()} retryLabel="重新加载" />}

    <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
      <Panel className="p-5">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.08]"><Cpu className="h-5 w-5 text-cyan-300" /></div><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-cyan-300/60">Active model</p><h2 className="mt-1 text-sm font-semibold text-white">当前默认模型</h2></div></div>
        {active?.configured ? <div className="mt-5 space-y-4"><div><p className="text-xl font-semibold text-white">{active.displayName}</p><p className="mt-1 font-mono text-xs text-slate-500">{active.modelName}</p></div><div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><span className={`h-2 w-2 rounded-full ${statusMeta[active.status ?? "untested"].dot}`} /><span className={`text-xs ${statusMeta[active.status ?? "untested"].className}`}>{statusMeta[active.status ?? "untested"].label}</span>{active.latencyMs != null && <span className="ml-auto text-[11px] text-slate-500">{active.latencyMs} ms</span>}</div><div className="grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-xl border border-white/[0.06] p-3 text-slate-500">温度<p className="numeric mt-1 text-sm text-slate-200">{active.temperature ?? 0.7}</p></div><div className="rounded-xl border border-white/[0.06] p-3 text-slate-500">最大 Tokens<p className="numeric mt-1 text-sm text-slate-200">{active.maxTokens ?? 4096}</p></div></div></div> : <div className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-center"><Unplug className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-200">尚未配置 AI 模型</p><p className="mt-2 text-xs leading-5 text-slate-500">助手、Agent 和 AI 投研在模型接入前不会生成任何伪造结果。</p><button onClick={openAdd} className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-2.5 text-xs text-cyan-200">立即接入模型</button></div>}
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Connection check" title="模型调用验证" description="通过真实 API 请求验证回答、延迟和 Token 用量。" />
        <div className="p-5"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} className="field-control resize-none" placeholder="输入用于验证模型连接的问题；不会自动填入业务数据" /><button onClick={() => void runPlayground(question)} disabled={!active?.configured || !question.trim() || playgroundRunning} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:cursor-not-allowed disabled:opacity-40">{playgroundRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}发送真实请求</button>{playgroundResult && <div className={`mt-4 rounded-xl border p-4 ${playgroundResult.ok ? "border-emerald-400/15 bg-emerald-400/[0.035]" : "border-rose-400/15 bg-rose-400/[0.035]"}`}><div className="flex items-center gap-2 text-xs">{playgroundResult.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-rose-300" />}<span className={playgroundResult.ok ? "text-emerald-200" : "text-rose-200"}>{playgroundResult.ok ? "调用成功" : "调用失败"}</span>{playgroundResult.ok && <span className="ml-auto text-[10px] text-slate-500">{playgroundResult.latencyMs} ms · {playgroundResult.totalTokens} tokens</span>}</div><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-300">{playgroundResult.ok ? playgroundResult.reply : playgroundResult.error}</p></div>}</div>
      </Panel>
    </div>

    <Panel>
      <PanelHeader eyebrow="Model registry" title="已配置模型" description="首个模型自动设为默认；修改地址、模型或密钥后需重新测试。" action={<span className="rounded-lg border border-white/[0.07] px-2.5 py-1.5 text-[10px] text-slate-500">{models.length} 个连接</span>} />
      {loading ? <div className="flex items-center justify-center gap-2 p-12 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />正在读取加密配置</div> : models.length === 0 ? <div className="p-12 text-center"><ServerCog className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 text-sm text-slate-300">没有模型配置</p><p className="mt-2 text-xs text-slate-600">添加一个模型后，所有 AI 页面才会开放真实调用。</p></div> : <div className="divide-y divide-white/[0.06]">{models.map((model) => { const meta = statusMeta[model.status]; return <article key={model.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_.65fr_auto] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate text-sm font-semibold text-slate-100">{model.displayName}</h3>{model.isDefault && <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/15 bg-amber-400/[0.05] px-2 py-1 text-[9px] text-amber-200"><Star className="h-3 w-3 fill-current" />默认</span>}</div><p className="mt-1.5 truncate font-mono text-[11px] text-slate-500">{model.modelId} · {model.keyMask}</p><p className="mt-1 truncate text-[10px] text-slate-600">{model.baseUrl}</p><div className="mt-2 flex flex-wrap gap-1.5">{(model.roles ?? ["default"]).map((role) => <span key={role} className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.04] px-2 py-1 text-[9px] text-cyan-200/70">{roleLabels[role]}</span>)}</div>{model.lastError && <p title={model.lastError} className="mt-2 line-clamp-2 text-[10px] leading-5 text-rose-300/70">最近错误：{model.lastError}</p>}</div><div><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${meta.dot}`} /><span className={`text-xs ${meta.className}`}>{meta.label}</span></div><p className="mt-1.5 text-[10px] text-slate-600">{PROVIDER_PRESETS[model.providerType]?.label ?? model.providerType}{model.lastLatencyMs != null ? ` · ${model.lastLatencyMs} ms` : ""}</p>{model.lastTestedAt && <p className="mt-1 text-[9px] text-slate-700">检测于 {new Date(model.lastTestedAt).toLocaleString("zh-CN")}</p>}</div><div className="flex flex-wrap items-center gap-2"><button onClick={() => void handleTest(model.id)} disabled={testing === model.id} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-[10px] text-slate-300 disabled:opacity-40">{testing === model.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}测试</button>{!model.isDefault && <Tooltip label="设为默认"><button onClick={() => void handleDefault(model.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] text-slate-400"><Star className="h-3.5 w-3.5" /></button></Tooltip>}<Tooltip label="编辑"><button onClick={() => { setEditing(model); setDialogOpen(true); }} className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] text-slate-400"><Pencil className="h-3.5 w-3.5" /></button></Tooltip><Tooltip label="删除"><button onClick={() => void handleDelete(model)} className="grid h-9 w-9 place-items-center rounded-lg border border-rose-400/10 text-rose-300/70"><Trash2 className="h-3.5 w-3.5" /></button></Tooltip></div></article>; })}</div>}
    </Panel>

    <div className="grid gap-3 md:grid-cols-3">{[[KeyRound,"密钥服务端加密","API Key 不返回浏览器，只展示掩码"],[ShieldCheck,"工作区会话隔离","当前开源模式以浏览器工作区会话隔离；生产多租户需接入企业身份与数据库策略"],[Zap,"按任务选择模型","可为对话、复杂研判、图像和长文档配置不同模型角色"]].map(([Icon,title,text]) => { const ItemIcon = Icon as typeof KeyRound; return <div key={String(title)} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><ItemIcon className="h-4 w-4 text-cyan-300" /><p className="mt-3 text-xs font-medium text-slate-200">{String(title)}</p><p className="mt-1.5 text-[10px] leading-5 text-slate-600">{String(text)}</p></div>; })}</div>

    <ModelFormDialog open={dialogOpen} onClose={() => { setDialogOpen(false); void refresh(); }} editing={editing} />
  </div>;
}
