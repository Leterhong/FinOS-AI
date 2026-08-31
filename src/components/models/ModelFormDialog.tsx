"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plug, Loader2, CheckCircle2, XCircle, KeyRound } from "lucide-react";
import { useModelStore } from "@/store/model-store";
import { PROVIDER_PRESETS, ALL_PRESETS } from "@/ai/model-center/providers/presets";
import type { ModelRole, ProviderType, PublicProviderConfig } from "@/ai/model-center/types";

const MODEL_ROLES: Array<{ value: ModelRole; label: string; description: string }> = [
  { value: "default", label: "通用默认", description: "未指定任务类型时使用" },
  { value: "chat", label: "对话助手", description: "问答与项目协作" },
  { value: "reasoning", label: "复杂研判", description: "规则匹配与风险分析" },
  { value: "vision", label: "图像理解", description: "扫描件与图表理解" },
  { value: "long-context", label: "长文档", description: "长篇资料归纳" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** 传入表示编辑模式。 */
  editing?: PublicProviderConfig | null;
}

export default function ModelFormDialog({ open, onClose, editing }: Props) {
  const addModel = useModelStore((s) => s.addModel);
  const updateModel = useModelStore((s) => s.updateModel);
  const testDraft = useModelStore((s) => s.testDraft);
  const testModel = useModelStore((s) => s.testModel);
  const isTesting = useModelStore((s) => s.isTesting);
  const isSaving = useModelStore((s) => s.isSaving);

  const [providerType, setProviderType] = useState<ProviderType>("deepseek");
  const [displayName, setDisplayName] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelId, setModelId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("4096");
  const [roles, setRoles] = useState<ModelRole[]>(["default"]);
  const [testState, setTestState] = useState<{
    ok: boolean;
    msg: string;
    latency?: number;
  } | null>(null);

  const preset = PROVIDER_PRESETS[providerType];

  // 初始化 / 切换 provider 时填充默认值。
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setProviderType(editing.providerType);
      setDisplayName(editing.displayName);
      setModelName(editing.modelName);
      setModelId(editing.modelId);
      setBaseUrl(editing.baseUrl);
      setTemperature(editing.temperature != null ? String(editing.temperature) : "0.7");
      setMaxTokens(editing.maxTokens != null ? String(editing.maxTokens) : "4096");
      setRoles(editing.roles?.length ? editing.roles : ["default"]);
      setApiKey(""); // 编辑时留空表示不改
      setTestState(null);
    } else {
      resetForProvider("deepseek");
    }
  }, [open, editing]);

  function resetForProvider(type: ProviderType) {
    const p = PROVIDER_PRESETS[type];
    setProviderType(type);
    setDisplayName(p.label);
    setBaseUrl(p.baseUrl);
    const first = p.suggestedModels[0];
    setModelId(first?.id ?? "");
    setModelName(first?.name ?? "");
    setTemperature("0.7");
    setMaxTokens("4096");
    setRoles(["default"]);
    setApiKey("");
    setTestState(null);
  }

  function parseNum(v: string, fallback?: number): number | undefined {
    if (v.trim() === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function draft() {
    return {
      providerName: providerType,
      displayName,
      modelName: modelName || modelId,
      modelId,
      baseUrl,
      apiKey: apiKey || undefined,
      roles,
      temperature: parseNum(temperature),
      maxTokens: parseNum(maxTokens),
    };
  }

  async function handleTest() {
    setTestState(null);
    const r = await testDraft(draft());
    if (r) {
      setTestState({
        ok: r.ok,
        msg: r.ok
          ? `连接成功${r.sampleReply ? ` · 回复「${r.sampleReply}」` : ""}`
          : r.error ?? "连接失败",
        latency: r.latencyMs,
      });
    }
  }

  async function handleSave() {
    let savedId: string;
    if (editing) {
      await updateModel(editing.id, draft());
      if (useModelStore.getState().error) return;
      savedId = editing.id;
    } else {
      const created = await addModel(draft());
      if (!created) return;
      savedId = created.id;
    }
    // 草稿连接已验证时，把验证状态同步到最终配置，避免保存后又显示“尚未测试”。
    if (testState?.ok) {
      const persisted = await testModel(savedId);
      if (!persisted?.ok) {
        setTestState({ ok: false, msg: persisted?.error ?? "配置已保存，但连接复测失败" });
        return;
      }
    }
    onClose();
  }

  const canSave = modelId.trim() && baseUrl.trim() && (editing || !preset.requiresKey || apiKey.trim());

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative z-10 w-full max-w-lg rounded-2xl glass border border-white/10 p-6 text-white max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-form-title"
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand">
                  <Plug className="h-4 w-4 text-white" />
                </span>
                <h3 id="model-form-title" className="text-lg font-semibold">
                  {editing ? "编辑 AI 模型" : "添加 AI 模型"}
                </h3>
              </div>
              <button type="button" onClick={onClose} aria-label="关闭" className="text-white/40 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Provider 选择 */}
            <label className="block text-xs text-white/50 mb-2">Provider</label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {ALL_PRESETS.map((p) => (
                <button
                  key={p.type}
                  onClick={() => !editing && resetForProvider(p.type)}
                  disabled={!!editing}
                  className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                    providerType === p.type
                      ? "bg-brand-electric/20 border border-brand-electric/40 text-white"
                      : "bg-white/[0.04] border border-white/8 text-white/60 hover:text-white disabled:opacity-40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {preset.hint && (
              <p className="text-[11px] text-white/40 mb-4 -mt-1">{preset.hint}</p>
            )}

            {/* 字段 */}
            <div className="space-y-3">
              <Field label="显示名称">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="如：我的 DeepSeek"
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="模型名称">
                  <input
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="DeepSeek-V3"
                    className="input"
                  />
                </Field>
                <Field label="Model ID">
                  <input
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    placeholder="deepseek-chat"
                    className="input"
                  />
                </Field>
              </div>
              {/* 建议模型快捷选择 */}
              {preset.suggestedModels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {preset.suggestedModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setModelId(m.id);
                        setModelName(m.name);
                      }}
                      className="rounded-lg bg-white/[0.04] px-2 py-1 text-[11px] text-white/50 hover:text-white hover:bg-white/[0.08]"
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
              <Field label="API URL (Base URL)">
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="input"
                />
              </Field>
              <Field
                label={
                  <span className="flex items-center gap-1">
                    <KeyRound className="h-3 w-3" /> API Key
                    {editing && <span className="text-white/30">（留空表示不修改）</span>}
                    {!preset.requiresKey && <span className="text-white/30">（本地模型可留空）</span>}
                  </span>
                }
              >
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="input font-mono"
                />
              </Field>

              <fieldset className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <legend className="px-1 text-xs text-white/55">任务角色</legend>
                <p className="mb-3 text-[11px] leading-5 text-white/35">
                  Agent 会优先选择匹配角色的在线模型；没有匹配项时才回退到默认模型。
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {MODEL_ROLES.map((role) => {
                    const checked = roles.includes(role.value);
                    return (
                      <label key={role.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${checked ? "border-cyan-400/25 bg-cyan-400/[0.06]" : "border-white/[0.06]"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => setRoles((current) => event.target.checked
                            ? [...current, role.value]
                            : current.filter((item) => item !== role.value))}
                          className="mt-0.5 accent-cyan-300"
                        />
                        <span>
                          <span className="block text-[11px] text-slate-200">{role.label}</span>
                          <span className="mt-0.5 block text-[9px] leading-4 text-slate-500">{role.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {roles.length === 0 && <p className="mt-2 text-[10px] text-amber-300">未选择角色时，此模型只能被明确指定调用。</p>}
              </fieldset>

              {/* 模型参数（Phase 6.2：用户可自助调节采样温度与最大 Token） */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="温度 (0–1)">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Max Tokens">
                  <input
                    type="number"
                    step="256"
                    min="1"
                    max="128000"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
              <p className="-mt-1 text-[11px] text-white/35">
                温度越高输出越发散（建议 0.3–0.8）；Max Tokens 控制单次回复长度上限。
              </p>
            </div>

            {/* 测试结果 */}
            {testState && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                  testState.ok
                    ? "bg-semantic-success/10 text-semantic-success"
                    : "bg-semantic-risk/10 text-semantic-risk"
                }`}
              >
                {testState.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0" />
                )}
                <span className="flex-1">{testState.msg}</span>
                {testState.latency !== undefined && testState.ok && (
                  <span className="text-xs text-white/40">{testState.latency}ms</span>
                )}
              </div>
            )}

            {/* 操作 */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleTest}
                disabled={isTesting === "draft" || !modelId.trim() || !baseUrl.trim()}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white hover:bg-white/[0.08] disabled:opacity-40"
              >
                {isTesting === "draft" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="h-4 w-4" />
                )}
                测试连接
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || isSaving}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow-blue disabled:opacity-40"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "保存修改" : "添加模型"}
              </button>
            </div>
          </motion.div>

          <style jsx>{`
            :global(.input) {
              width: 100%;
              border-radius: 0.75rem;
              background: rgba(255, 255, 255, 0.04);
              border: 1px solid rgba(255, 255, 255, 0.08);
              padding: 0.6rem 0.75rem;
              font-size: 0.875rem;
              color: white;
              outline: none;
              transition: border-color 0.2s;
            }
            :global(.input:focus) {
              border-color: rgba(59, 130, 246, 0.5);
            }
            :global(.input::placeholder) {
              color: rgba(255, 255, 255, 0.25);
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-white/50">{label}</span>
      {children}
    </label>
  );
}
