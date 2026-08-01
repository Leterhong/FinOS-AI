"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Send,
  Bot,
  Mic,
  UploadCloud,
  CheckCircle2,
  XCircle,
  FileText,
  Play,
  RefreshCw,
} from "lucide-react";
import PageTransition from "@/components/dashboard/PageTransition";
import { Button } from "@/components/ui/button";
import GradientText from "@/components/ui/GradientText";
import { useToast } from "@/components/ui/use-toast";
import { SimulatedDataNotice } from "@/components/ui/SimulatedDataNotice";
import { SIMULATED_MARKER } from "@/ai/tools/types";
import {
  useMultimodalCapabilities,
  useMultimodalPending,
  useMultimodalIngestText,
  useMultimodalUpload,
  useMultimodalConfirm,
  useMultimodalReject,
  useAgentsMarket,
  useConfigureAgents,
  useRunSingle,
  useRunWorkflow,
  useReportKinds,
  useReportGenerate,
} from "@/hooks/use-backend";
import { backendApi } from "@/lib/backend-client";
import type {
  Extraction,
  MultimodalCapabilities,
  PendingResult,
  ConfirmEdit,
} from "@/types/multimodal";
import type {
  AgentMeta,
  AgentResultItem,
  MarketplaceResult,
  WorkflowResult,
  RunSingleResult,
  RunsResult,
} from "@/types/agents";

type TabKey = "chat" | "capture" | "agents" | "reports";

const KIND_LABEL: Record<string, string> = {
  asset: "资产",
  liability: "负债",
  income: "收入",
  expense: "支出",
  goal: "目标",
  profile: "画像",
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  disclaimer?: string;
}

export default function AssistantPage() {
  const [tab, setTab] = useState<TabKey>("chat");

  const caps = useMultimodalCapabilities();
  const capabilities = caps.data as MultimodalCapabilities | undefined;

  return (
    <PageTransition>
      <div className="flex h-full min-h-0 flex-col">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pb-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-blue">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                <GradientText>AI 助手</GradientText>
              </h1>
              <p className="text-xs text-white/40">
                一句话对话、拍照/传文件识别录入、语音指令、调用智能体与生成报告 —— 统一入口
              </p>
            </div>
          </div>

          {/* 能力胶囊 */}
          {capabilities && (
            <div className="mt-3 flex flex-wrap gap-2">
              {capabilities.modalities.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60"
                >
                  {m === "text" ? "文本" : m === "image" ? "图片" : m === "audio" ? "语音" : "文档"}
                </span>
              ))}
              <span className="rounded-full border border-semantic-success/30 bg-semantic-success/10 px-2.5 py-1 text-[11px] text-semantic-success">
                识别需确认后写入
              </span>
            </div>
          )}
        </motion.div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
          {(
            [
              { key: "chat", label: "对话", icon: Send },
              { key: "capture", label: "识别录入", icon: UploadCloud },
              { key: "agents", label: "智能体", icon: Bot },
              { key: "reports", label: "报告", icon: FileText },
            ] as { key: TabKey; label: string; icon: typeof Send }[]
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  active
                    ? "bg-brand-electric/15 text-white shadow-glow-blue"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pr-1">
          {tab === "chat" && <ChatTab />}
          {tab === "capture" && <CaptureTab />}
          {tab === "agents" && <AgentsTab />}
          {tab === "reports" && <ReportsTab />}
        </div>

        {capabilities?.disclaimer && (
          <p className="mt-3 text-[11px] leading-relaxed text-white/30">
            {capabilities.disclaimer}
          </p>
        )}
      </div>
    </PageTransition>
  );
}

/* ====================================================================== 对话 */
function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [recognize, setRecognize] = useState(false); // 识别录入模式
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ingestText = useMultimodalIngestText();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, processing]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || processing) return;
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
      setMessages((p) => [...p, userMsg]);
      setInput("");
      setProcessing(true);

      try {
        if (recognize) {
          // 识别录入模式：文本 → 多模态识别，结果进入「待确认」
          const res = (await ingestText.mutateAsync({ text })) as {
            extractions?: Extraction[];
          };
          const n = res.extractions?.length ?? 0;
          setToast(`已识别 ${n} 条信息，请在「识别录入」中确认后写入财富分身`);
          setMessages((p) => [
            ...p,
            {
              id: `a-${Date.now()}`,
              role: "assistant",
              content:
                n > 0
                  ? `我识别到 ${n} 条内容（如资产、收入、目标等），已放入待确认列表，请到「识别录入」逐条确认。`
                  : "没有从这段话中识别到可写入财富分身的明确信息，换个说法试试？",
            },
          ]);
        } else {
          // 对话模式：AI CFO 基于真实财富数据回复
          const res = (await backendApi.intelligence.chat({
            message: text,
            sessionId: sessionId ?? undefined,
            useAi: true,
          })) as {
            hasData: boolean;
            sessionId?: string;
            reply?: string;
            message?: string;
            disclaimer?: string;
          };
          if (res.sessionId) setSessionId(res.sessionId);
          setMessages((p) => [
            ...p,
            {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: res.reply || res.message || "（暂无回复）",
              disclaimer: res.disclaimer,
            },
          ]);
        }
      } catch (e) {
        setMessages((p) => [
          ...p,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: `出错了：${e instanceof Error ? e.message : "请求失败"}`,
          },
        ]);
      } finally {
        setProcessing(false);
      }
    },
    [processing, recognize, sessionId, ingestText],
  );

  // 浏览器语音识别（零成本，可选）
  const toggleMic = useCallback(() => {
    const SR =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (!SR) {
      setToast("当前浏览器不支持语音识别，请手动输入");
      return;
    }
    // 动态构造识别器，避免 TS 缺失类型
    const recognition = new (SR as new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      start: () => void;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
      onerror: ((e: { error: string }) => void) | null;
    })();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput((v) => (v ? v + transcript : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    if (listening) {
      setListening(false);
    } else {
      setListening(true);
      recognition.start();
    }
  }, [listening]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto pr-2 pb-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
              <Bot className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">你好，我是你的 AI 助手</h2>
            <p className="mt-2 max-w-md text-sm text-white/50">
              直接提问，或开启「识别录入」把一段话里的资产、收入、目标等自动提取出来待你确认。
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    m.role === "user" ? "bg-white/10" : "bg-gradient-brand"
                  }`}
                >
                  {m.role === "user" ? (
                    <span className="text-sm text-white/70">你</span>
                  ) : (
                    <Bot className="h-4 w-4 text-white" />
                  )}
                </div>
                <div className={`max-w-[78%] ${m.role === "user" ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-white/90 ${
                      m.role === "user" ? "glass-strong rounded-tr-sm text-left" : "glass rounded-tl-sm"
                    }`}
                  >
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                  {m.role !== "user" && m.content.includes(SIMULATED_MARKER) && (
                    <div className="mt-1.5">
                      <SimulatedDataNotice variant="compact" />
                    </div>
                  )}
                  {m.disclaimer && (
                    <p className="mt-1 text-[10px] text-white/30">{m.disclaimer}</p>
                  )}
                </div>
              </motion.div>
            ))}
            {processing && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-brand">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl glass px-4 py-3">
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="text-sm text-white/50"
                  >
                    AI 正在思考……
                  </motion.span>
                </div>
              </div>
            )}
          </AnimatePresence>
        )}
      </div>

      {toast && (
        <div className="mb-2 rounded-lg border border-brand-electric/30 bg-brand-electric/10 px-3 py-2 text-xs text-brand-electric">
          {toast}
        </div>
      )}

      <div className="pt-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] text-white/40">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={recognize}
              onChange={(e) => setRecognize(e.target.checked)}
              className="accent-brand-electric"
            />
            识别录入模式（把文本提取为待确认条目）
          </label>
        </div>
        <div className="glass rounded-2xl p-2 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={recognize ? "描述你的资产/收入/目标，例如：我月薪两万，持有茅台 100 股" : "向 AI 助手提问，例如：我如何在 40 岁退休？"}
            rows={1}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white placeholder-white/30 outline-none"
            disabled={processing}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleMic}
            className={listening ? "text-semantic-success" : ""}
            title="语音输入"
          >
            <Mic className="h-4 w-4" />
          </Button>
          <Button size="icon" onClick={() => send(input)} disabled={!input.trim() || processing}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== 识别录入 */
function CaptureTab() {
  const pending = useMultimodalPending();
  const upload = useMultimodalUpload();
  const confirm = useMultimodalConfirm();
  const reject = useMultimodalReject();

  const items = (pending.data as PendingResult | undefined)?.items ?? [];
  const [dragOver, setDragOver] = useState(false);
  const [edits, setEdits] = useState<Record<string, ConfirmEdit>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      for (const f of Array.from(files)) {
        try {
          await upload.mutateAsync({ file: f });
        } catch (e) {
          setBanner(`「${f.name}」识别失败：${e instanceof Error ? e.message : "请重试"}`);
        }
      }
    },
    [upload],
  );

  const doConfirm = useCallback(async () => {
    const ids = items.filter((x) => selected[x.id] !== false).map((x) => x.id);
    if (ids.length === 0) {
      setBanner("请至少选择一条待确认项");
      return;
    }
    const cleanEdits: Record<string, ConfirmEdit> = {};
    for (const id of ids) {
      if (edits[id]) cleanEdits[id] = edits[id];
    }
    try {
      const res = (await confirm.mutateAsync({ ids, edits: cleanEdits })) as {
        applied?: number;
        message?: string;
      };
      setBanner(`已写入 ${res.applied ?? ids.length} 条到财富分身`);
      setEdits({});
    } catch (e) {
      setBanner(`确认失败：${e instanceof Error ? e.message : "请重试"}`);
    }
  }, [items, selected, edits, confirm]);

  const doReject = useCallback(
    async (id: string) => {
      try {
        await reject.mutateAsync([id]);
        setBanner("已移出待确认");
      } catch (e) {
        setBanner(`拒绝失败：${e instanceof Error ? e.message : "请重试"}`);
      }
    },
    [reject],
  );

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all ${
          dragOver
            ? "border-brand-electric bg-brand-electric/10"
            : "border-white/15 bg-white/[0.02] hover:border-white/30"
        }`}
      >
        <UploadCloud className="mb-2 h-8 w-8 text-white/50" />
        <p className="text-sm text-white/70">拖拽图片 / 文件 / 语音到这里，或点击选择</p>
        <p className="mt-1 text-[11px] text-white/35">
          支持 图片、PDF、Excel、Word、CSV、TXT、MD、JSON、HTML、音频（自动识别类型）
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,audio/*,.pdf,.csv,.tsv,.txt,.md,.json,.html,.xlsx,.xls,.docx"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {banner && (
        <div className="rounded-lg border border-brand-electric/30 bg-brand-electric/10 px-3 py-2 text-xs text-brand-electric">
          {banner}
        </div>
      )}

      {/* Pending list */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/80">
          待确认识别结果（{items.length}）
        </h3>
        {items.length > 0 && (
          <Button size="sm" onClick={doConfirm} disabled={confirm.isPending}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            确认选中并写入
          </Button>
        )}
      </div>

      {pending.isLoading ? (
        <p className="text-sm text-white/40">加载中……</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl glass p-6 text-center text-sm text-white/40">
          暂无待确认项。上传图片或文件，或到「对话」开启识别录入模式试试。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((x: Extraction) => (
            <div key={x.id} className="rounded-2xl glass p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  defaultChecked
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [x.id]: e.target.checked }))
                  }
                  className="mt-1 accent-brand-electric"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand-electric/15 px-2 py-0.5 text-[10px] text-brand-electric">
                      {KIND_LABEL[x.kind] ?? x.kind}
                    </span>
                    <span className="text-[11px] text-white/40">
                      置信度 {Math.round((x.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      defaultValue={x.label}
                      onChange={(e) =>
                        setEdits((s) => ({
                          ...s,
                          [x.id]: { ...s[x.id], label: e.target.value },
                        }))
                      }
                      className="rounded-lg bg-white/[0.04] px-2 py-1.5 text-sm text-white outline-none ring-brand-electric/30 focus:ring"
                      placeholder="名称"
                    />
                    <input
                      type="number"
                      defaultValue={x.amount}
                      onChange={(e) =>
                        setEdits((s) => ({
                          ...s,
                          [x.id]: { ...s[x.id], amount: Number(e.target.value) },
                        }))
                      }
                      className="rounded-lg bg-white/[0.04] px-2 py-1.5 text-sm text-white outline-none ring-brand-electric/30 focus:ring"
                      placeholder="金额"
                    />
                  </div>
                  {x.evidence && (
                    <p className="mt-1.5 text-[11px] text-white/35">依据：{x.evidence}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => doReject(x.id)}
                  className="shrink-0 text-white/40 transition hover:text-semantic-warn"
                  title="拒绝此条"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== 智能体 */
function ThreeStage({ result }: { result: AgentResultItem }) {
  return (
    <div className="rounded-2xl glass p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand-electric" />
          <span className="text-sm font-semibold text-white">{result.title || result.agent}</span>
        </div>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
          {result.tier === "ai" ? "AI" : "本地"} · {result.elapsedMs}ms
        </span>
      </div>
      {result.headline && (
        <p className="mt-2 text-sm text-white/85">{result.headline}</p>
      )}
      <div className="mt-3 space-y-2 text-xs">
        {result.cause?.length > 0 && (
          <Block label="原因" items={result.cause} color="text-white/70" />
        )}
        {result.impact?.length > 0 && (
          <Block label="影响" items={result.impact} color="text-white/70" />
        )}
        {result.advice?.length > 0 && (
          <Block label="建议" items={result.advice} color="text-brand-electric" />
        )}
      </div>
    </div>
  );
}

function Block({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wider text-white/35">{label}</p>
      <ul className={`space-y-0.5 ${color}`}>
        {items.map((it, i) => (
          <li key={i}>· {it}</li>
        ))}
      </ul>
    </div>
  );
}

function AgentsTab() {
  const market = useAgentsMarket();
  const configure = useConfigureAgents();
  const runSingle = useRunSingle();
  const runWorkflow = useRunWorkflow();
  const { toast, Toast } = useToast();

  const agents = (market.data as MarketplaceResult | undefined)?.items ?? [];
  const [single, setSingle] = useState<Record<string, AgentResultItem>>({});
  const [workflow, setWorkflow] = useState<WorkflowResult | null>(null);

  const toggle = useCallback(
    async (a: AgentMeta) => {
      try {
        await configure.mutateAsync({
          name: a.name,
          payload: { enabled: !a.enabled },
        });
      } catch (e) {
        toast(`调整开关失败：${e instanceof Error ? e.message : "请重试"}`);
      }
    },
    [configure, toast],
  );

  const runOne = useCallback(
    async (name: string) => {
      try {
        const res = (await runSingle.mutateAsync({ name })) as RunSingleResult;
        if (res.result) setSingle((s) => ({ ...s, [name]: res.result }));
      } catch (e) {
        toast(`运行失败：${e instanceof Error ? e.message : "请重试"}`);
      }
    },
    [runSingle, toast],
  );

  const runWf = useCallback(async () => {
    try {
      const res = (await runWorkflow.mutateAsync({ question: "", useAi: true })) as WorkflowResult;
      setWorkflow(res);
    } catch (e) {
      toast(`工作流失败：${e instanceof Error ? e.message : "请重试"}`);
    }
  }, [runWorkflow, toast]);

  return (
    <div className="space-y-4">
      {Toast}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/80">智能体市场（{agents.length}）</h3>
        <Button size="sm" onClick={runWf} disabled={runWorkflow.isPending}>
          <Play className="mr-1 h-3.5 w-3.5" />
          运行全部工作流
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {agents.map((a) => (
          <div key={a.name} className="rounded-2xl glass p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{a.title}</p>
                <p className="text-[11px] text-white/40">{a.domain}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(a)}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  a.enabled ? "bg-brand-electric" : "bg-white/15"
                }`}
                title={a.enabled ? "已开启" : "已关闭"}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    a.enabled ? "left-4" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-white/55">{a.description}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-white/35">
                {a.tools?.length ? `工具：${a.tools.join("、")}` : "无工具"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => runOne(a.name)} disabled={runSingle.isPending}>
                <Play className="mr-1 h-3 w-3" />
                运行
              </Button>
            </div>
            {single[a.name] && (
              <div className="mt-3 border-t border-white/8 pt-3">
                <ThreeStage result={single[a.name]} />
              </div>
            )}
          </div>
        ))}
      </div>

      {workflow && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <RefreshCw className="h-4 w-4 text-brand-electric" />
            工作流结果
          </div>
          {(workflow.results ?? []).map((r, i) => (
            <ThreeStage key={`${r.agent}-${i}`} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== 报告 */
function ReportsTab() {
  const kinds = useReportKinds();
  const generate = useReportGenerate();
  const { toast, Toast } = useToast();

  const items =
    (kinds.data as { items?: { kind: string; title: string; sections: string[] }[] } | undefined)
      ?.items ?? [];
  const [last, setLast] = useState<{ title: string; kind: string } | null>(null);

  const gen = useCallback(
    async (kind: string) => {
      try {
        const res = (await generate.mutateAsync({ kind, useAi: true, persist: true })) as {
          title?: string;
          id?: string;
        };
        setLast({ title: res.title ?? kind, kind });
      } catch (e) {
        toast(`生成失败：${e instanceof Error ? e.message : "请重试"}`);
      }
    },
    [generate, toast],
  );

  return (
    <div className="space-y-4">
      {Toast}
      <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
        <FileText className="h-4 w-4 text-brand-electric" />
        生成财富报告
      </div>

      {kinds.isLoading ? (
        <p className="text-sm text-white/40">加载中……</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((k) => (
            <div key={k.kind} className="rounded-2xl glass p-4">
              <p className="text-sm font-semibold text-white">{k.title}</p>
              <p className="mt-1 text-[11px] text-white/40">
                包含：{k.sections?.join("、")}
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => gen(k.kind)}
                disabled={generate.isPending}
              >
                <FileText className="mr-1 h-3.5 w-3.5" />
                生成并保存
              </Button>
            </div>
          ))}
        </div>
      )}

      {last && (
        <div className="rounded-2xl border border-semantic-success/30 bg-semantic-success/10 p-4">
          <div className="flex items-center gap-2 text-sm text-semantic-success">
            <CheckCircle2 className="h-4 w-4" />
            已生成：{last.title}
          </div>
          <Link
            href="/report"
            className="mt-2 inline-flex items-center gap-1 text-xs text-brand-electric hover:underline"
          >
            前往「财富报告」查看与导出 →
          </Link>
        </div>
      )}
    </div>
  );
}
