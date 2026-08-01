"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Send, Sparkles, User, Rocket, CheckCircle2, Circle, Cpu, AlertTriangle, Clock } from "lucide-react";
import PageTransition from "@/components/dashboard/PageTransition";
import { useFinancialStore } from "@/store/financial-store";
import { useModelStore } from "@/store/model-store";
import { useAuthStore } from "@/store/auth-store";
import type { AgentResult } from "@/data/types";
import type { AgentAnalysis } from "@/agents/types";
import type { ToolCallRecord } from "@/ai/tools/types";
import type { WealthTask } from "@/wealth/tasks";
import type { ChatIntent } from "@/ai/types";
import { classifyIntent } from "@/ai/intent/router";

import AgentStepIndicator from "@/components/chat/AgentStepIndicator";
import ReportMessage from "@/components/chat/ReportMessage";
import GradientText from "@/components/ui/GradientText";
import { Button } from "@/components/ui/button";
import NoFinancialData from "@/components/dashboard/NoFinancialData";
import { ChatSkeleton } from "@/components/skeletons";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentSteps?: AgentResult[];
  analyses?: AgentAnalysis[];
  toolCalls?: ToolCallRecord[];
  isStreaming?: boolean;
  isWorkflow?: boolean;
  /** Phase 5：Copilot 创建的执行任务（自然语言驱动计划时附带的待办）。 */
  createdTasks?: WealthTask[];
  /** Phase 5.9.6：Intent Router 意图标签（用于直达回复的消息）。 */
  intent?: ChatIntent;
}

const initialSteps: AgentResult[] = [
  { agent: "planner", status: "idle", summary: "" },
  { agent: "cashflow", status: "idle", summary: "" },
  { agent: "investment", status: "idle", summary: "" },
  { agent: "risk", status: "idle", summary: "" },
  { agent: "retirement", status: "idle", summary: "" },
  { agent: "strategy", status: "idle", summary: "" },
  { agent: "summary", status: "idle", summary: "" },
];

function formatAnalysisTime(ts: number): string {
  const d = new Date(ts);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Phase 5.9.6：意图标签（展示给用户，体现 Intent Router 分流）。 */
const INTENT_LABEL: Record<ChatIntent, string> = {
  greeting: "问候",
  model_info: "模型信息",
  financial_analysis: "财富分析",
  profile_update: "画像更新",
  general_question: "金融知识",
};

export default function ChatPage() {
  const currentUserId = useFinancialStore((s) => s.currentUserId);
  const profileStatus = useFinancialStore((s) => s.profileStatus);
  const loadUserProfile = useFinancialStore((s) => s.loadUserProfile);
  const runChat = useFinancialStore((s) => s.runChat);
  const runCopilot = useFinancialStore((s) => s.runCopilot);

  // Phase 5.9：仅当用户已加载真实财富画像时才允许 AI CFO 对话；
  // 否则展示空状态引导，禁止任何 AI 伪造分析。
  const hasProfile = profileStatus === "loaded";
  const profileLoading = profileStatus === "loading";
  const completeTask = useFinancialStore((s) => s.completeTask);
  const workflowPhase = useFinancialStore((s) => s.workflowPhase);
  const agentStates = useFinancialStore((s) => s.agentStates);
  const toggleEvent = useFinancialStore((s) => s.toggleEvent);
  const activeEvents = useFinancialStore((s) => s.activeEvents);

  // Phase 5.5：加载当前激活模型，用于「Powered by」徽标
  const activeModel = useModelStore((s) => s.active);
  const setModelUserId = useModelStore((s) => s.setUserId);
  const loadActiveModel = useModelStore((s) => s.loadActive);

  // Phase 6.2：当前会话用户就绪时加载其财富画像（仅 profileCompleted=true 才拉取，
  // 避免无画像新用户进入 chat 触发 404）；与 /dashboard、/twin 等页面保持一致，
  // 让用户刷新 /chat 不会"掉画像"。
  const profileCompleted = useAuthStore((s) => s.currentUser?.profileCompleted);
  useEffect(() => {
    if (currentUserId && profileCompleted === true) {
      loadUserProfile(currentUserId);
    }
  }, [currentUserId, profileCompleted, loadUserProfile]);

  useEffect(() => {
    setModelUserId(currentUserId);
    loadActiveModel(currentUserId);
  }, [currentUserId, setModelUserId, loadActiveModel]);

  // Phase 5.9.1：读取最近一次分析时间，用于「AI CFO 已准备」状态展示（spec #2）
  useEffect(() => {
    if (!hasProfile) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/ai/usage");
        if (!res.ok) return;
        const data = (await res.json()) as { summary: { lastCallAt: number | null } };
        if (active) setLastAnalysisAt(data.summary.lastCallAt);
      } catch {
        /* 忽略：不影响对话 */
      }
    })();
    return () => {
      active = false;
    };
  }, [hasProfile]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lastAnalysisAt, setLastAnalysisAt] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Phase 5.9：删除自动生成的欢迎分析 / 主动简报。
  // 真实用户未创建财富画像时，AI CFO 不再自动播报任何「财富分身」分析，
  // 而是由 NoFinancialData 引导创建画像（见下方渲染分支）。

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, workflowPhase]);

  // Detect scenario keywords and apply events
  const detectAndApplyScenario = (text: string) => {
    const lower = text.toLowerCase();
    const scenarios = [
      { keywords: ["buy house", "buy property", "买房", "property"], event: "buyHouse" },
      { keywords: ["start business", "startup", "创业", "quit job"], event: "startBusiness" },
      { keywords: ["marry", "married", "结婚", "marriage"], event: "getMarried" },
      { keywords: ["child", "baby", "kid", "孩子", "育儿"], event: "haveChild" },
      { keywords: ["invest more", "increase investment", "投资更多"], event: "increaseInvestment" },
      { keywords: ["new job", "career change", "跳槽", "换工作"], event: "careerChange" },
      { keywords: ["retire at 40", "early retirement", "40岁退休"], event: "earlyRetirement" },
    ];

    const applied: string[] = [];
    for (const s of scenarios) {
      if (s.keywords.some((k) => lower.includes(k))) {
        if (!activeEvents.includes(s.event)) {
          toggleEvent(s.event);
          applied.push(s.event);
        }
      }
    }
    return applied;
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || processing) return;

    // Phase 5.9.6：Intent Router —— 客户端先识别意图，决定 UI 形态与是否触发财富分析工作流。
    const intent = classifyIntent(text).intent;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };

    const aiMsgId = `ai-${Date.now() + 1}`;
    const aiMsg: Message =
      intent === "financial_analysis"
        ? {
            id: aiMsgId,
            role: "assistant",
            content: "",
            agentSteps: initialSteps.map((s) => ({ ...s })),
            isStreaming: true,
            isWorkflow: true,
            intent,
          }
        : {
            id: aiMsgId,
            role: "assistant",
            content: "",
            isStreaming: true,
            isWorkflow: false,
            intent,
          };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setProcessing(true);

    if (intent === "financial_analysis") {
      // 财务分析：触发完整多智能体工作流 + 情景检测 + 副驾驶执行。
      detectAndApplyScenario(text);

      await runChat(text);

      // Phase 5：若用户表达执行意图（如"我最近花钱太多"/"帮我制定退休计划"），
      // 调用 Copilot 副驾驶：分析 + 生成行动计划 + 创建任务 + 跟踪执行。
      let createdTasks: WealthTask[] = [];
      const execIntent = /制定|计划|规划|花钱|消费|攒|省|执行|任务|存钱|预算|退休|买房|目标|太少/.test(text);
      if (execIntent) {
        await runCopilot(text, { createTasks: true });
        createdTasks = useFinancialStore.getState().wealthTasks;
      }

      const results = useFinancialStore.getState().workflowResults;
      const toolCalls = useFinancialStore.getState().toolCalls;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                agentSteps: useFinancialStore.getState().agentStates,
                analyses: results,
                toolCalls,
                createdTasks,
                isStreaming: false,
              }
            : m
        )
      );
    } else {
      // 直达回复（问候 / 模型信息 / 通用知识 / 画像更新）：不触发任何财富分析。
      await runChat(text);
      const reply = useFinancialStore.getState().lastDirectReply;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: reply?.content ?? "", isStreaming: false }
            : m
        )
      );
    }
    setProcessing(false);
  };

  // Sync agent states to the streaming message
  useEffect(() => {
    if (processing) {
      setMessages((prev) =>
        prev.map((m) =>
          m.isStreaming && m.isWorkflow
            ? { ...m, agentSteps: [...agentStates] }
            : m
        )
      );
    }
  }, [agentStates, processing]);

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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-purple">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <GradientText>AI 财富顾问对话</GradientText>
            </h1>
            <p className="text-xs text-white/40">
              AI CFO 会先识别你的意图，再决定如何帮你 —— 闲聊、查模型、学知识都不会触发财富分析
            </p>
            {/* Phase 5.5：当前模型徽标（点击查看模型详情） */}
            {activeModel?.configured ? (
              <Link
                href="/settings/models"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-2.5 py-1 text-[11px] text-brand-electric transition hover:bg-brand-electric/20"
                title="查看模型详情"
              >
                <Cpu className="h-3 w-3" />
                AI CFO Powered by: {activeModel.modelName}
              </Link>
            ) : (
              <Link
                href="/settings/models"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-semantic-warn/40 bg-semantic-warn/10 px-2.5 py-1 text-[11px] text-semantic-warn transition hover:bg-semantic-warn/20"
                title="尚未连接模型，点击前往配置"
              >
                <AlertTriangle className="h-3 w-3" />
                未连接模型 · 点击接入
              </Link>
            )}
          </div>

          {/* 终端状态栏：AI CFO Online / 模型 Connected / 分析 Ready */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-semantic-success/30 bg-semantic-success/10 px-2.5 py-1 text-[11px] text-semantic-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-semantic-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-semantic-success" />
              </span>
              AI CFO Online
            </span>
            {activeModel?.configured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-2.5 py-1 text-[11px] text-brand-electric">
                <CheckCircle2 className="h-3 w-3" /> 模型 Connected · {activeModel.modelName}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-semantic-warn/40 bg-semantic-warn/10 px-2.5 py-1 text-[11px] text-semantic-warn">
                <AlertTriangle className="h-3 w-3" /> 模型 未连接
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
              <Circle className="h-3 w-3 text-semantic-success" /> 分析 Ready
            </span>
          </div>
          </div>
        </motion.div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-thin space-y-6 pr-2 pb-4"
        >
          {profileLoading ? (
            /* Phase 7.0.4 #306：刷新 /chat 时，主动 loadUserProfile 会触发一次短暂的 loading；
               此处显示骨架屏避免从「无画像」快速跳到「有画像」的视觉闪烁。 */
            <ChatSkeleton />
          ) : !hasProfile ? (
            <NoFinancialData
              title="你好，我还不了解你的财富情况"
              subtitle="创建你的财富画像后，AI CFO 才能基于你的真实数据为你分析、规划与复盘。"
            />
          ) : messages.length === 0 ? (
            /* Phase 5.9.1：AI CFO 已准备 —— 不自动调用 LLM，等待用户输入（spec #2/#8） */
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-purple">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white">你好，我是你的 AI CFO</h2>
              <p className="mt-2 max-w-md text-sm text-white/50">
                提出任何财务问题，我将基于你的真实财富数据为你分析、规划与复盘。
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-semantic-success/30 bg-semantic-success/10 px-3 py-1.5 text-xs text-semantic-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 已准备
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60">
                  <Clock className="h-3.5 w-3.5" /> 最近分析：
                  {lastAnalysisAt ? formatAnalysisTime(lastAnalysisAt) : "暂无"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60">
                  <Cpu className="h-3.5 w-3.5" /> 当前模型：
                  {activeModel?.configured ? activeModel.modelName : "未连接"}
                </span>
              </div>
            </div>
          ) : (
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                {/* Avatar */}
                <div
                  className={
                    msg.role === "user"
                      ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10"
                      : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-brand"
                  }
                >
                  {msg.role === "user" ? (
                    <User className="h-4 w-4 text-white/70" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-white" />
                  )}
                </div>

                {/* Content */}
                <div className={`max-w-[75%] ${msg.role === "user" ? "text-right" : ""}`}>
                  {msg.role === "user" ? (
                    <div className="inline-block glass-strong rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white/90 text-left">
                      {msg.content}
                    </div>
                  ) : (
                    <div>
                      {/* Phase 5.9.6：Intent Router 意图标签（直达回复可见分流） */}
                      {msg.intent && !msg.isWorkflow && (
                        <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35">
                          {INTENT_LABEL[msg.intent]}
                        </div>
                      )}

                      {/* Workflow phase indicator */}
                      {msg.isStreaming && (
                        <div className="mb-2 flex items-center gap-2 text-xs text-brand-electric">
                          {workflowPhase === "recognizing-goal" && (
                            <motion.span
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              🔍 正在识别您的目标……
                            </motion.span>
                          )}
                          {workflowPhase === "planning" && (
                            <motion.span
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              🧠 规划器正在拆解您的问题……
                            </motion.span>
                          )}
                          {workflowPhase === "executing" && (
                            <motion.span
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              ⚡ 智能体正在分析中……
                            </motion.span>
                          )}
                          {workflowPhase === "summarizing" && (
                            <motion.span
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              📝 正在生成财富策略……
                            </motion.span>
                          )}
                        </div>
                      )}

                      {/* Steps indicator */}
                      {msg.agentSteps && (
                        <AgentStepIndicator steps={msg.agentSteps} />
                      )}

                      {/* Phase 5.9.6：直达回复的「思考中」指示器（不展示 Agent 步骤） */}
                      {msg.isStreaming && !msg.isWorkflow && (
                        <div className="mt-2 glass rounded-2xl p-4 inline-flex items-center gap-2">
                          <motion.div
                            className="flex gap-1"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                className="h-1.5 w-1.5 rounded-full bg-brand-electric"
                                animate={{ y: [0, -4, 0] }}
                                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                              />
                            ))}
                          </motion.div>
                          <span className="text-sm text-white/50">AI CFO 正在思考……</span>
                        </div>
                      )}

                      {/* Streaming indicator */}
                      {msg.isStreaming && (
                        <div className="mt-3 glass rounded-2xl p-4 inline-flex items-center gap-2">
                          <motion.div
                            className="flex gap-1"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                className="h-1.5 w-1.5 rounded-full bg-brand-electric"
                                animate={{ y: [0, -4, 0] }}
                                transition={{
                                  duration: 0.6,
                                  repeat: Infinity,
                                  delay: i * 0.1,
                                }}
                              />
                            ))}
                          </motion.div>
                          <span className="text-sm text-white/50">
                            {workflowPhase === "recognizing-goal"
                              ? "正在识别目标……"
                              : workflowPhase === "planning"
                              ? "正在规划工作流……"
                              : workflowPhase === "summarizing"
                              ? "正在生成总结……"
                              : "智能体分析中……"}
                          </span>
                        </div>
                      )}

                      {/* Results */}
                      {msg.analyses && !msg.isStreaming && (
                        <div className="mt-3">
                          <ReportMessage
                            analyses={msg.analyses}
                            summary={msg.analyses.find((a) => a.agent === "summary")}
                            toolCalls={msg.toolCalls}
                          />
                        </div>
                      )}

                      {/* 纯文本主动消息（如 AI CFO 主动简报） */}
                      {msg.content && !msg.isWorkflow && !msg.isStreaming && (
                        <div className="mt-2 whitespace-pre-wrap rounded-2xl glass p-4 text-sm leading-relaxed text-white/80">
                          {msg.content}
                        </div>
                      )}

                      {/* Phase 5：Copilot 创建的执行任务卡片 */}
                      {msg.createdTasks && msg.createdTasks.length > 0 && !msg.isStreaming && (
                        <div className="mt-3 rounded-2xl glass p-4">
                          <div className="mb-2 flex items-center gap-1.5 text-xs text-brand-purple">
                            <Rocket className="h-3.5 w-3.5" />
                            AI 已为你创建 {msg.createdTasks.length} 项执行任务
                          </div>
                          <ul className="space-y-1.5">
                            {msg.createdTasks.slice(0, 5).map((t) => (
                              <li key={t.id} className="flex items-start gap-2">
                                <button
                                  onClick={() => {
                                    completeTask(t.id);
                                    setMessages((prev) =>
                                      prev.map((m) =>
                                        m.id === msg.id
                                          ? {
                                              ...m,
                                              createdTasks: (m.createdTasks ?? []).map((x) =>
                                                x.id === t.id
                                                  ? { ...x, status: "done", completedAt: Date.now() }
                                                  : x
                                              ),
                                            }
                                          : m
                                      )
                                    );
                                  }}
                                  className="mt-0.5 shrink-0 text-white/40 transition hover:text-emerald-300"
                                  title="标记完成"
                                >
                                  {t.status === "done" ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                                  ) : (
                                    <Circle className="h-4 w-4" />
                                  )}
                                </button>
                                <div className="min-w-0">
                                  <p className="text-sm text-white/85 leading-tight">{t.title}</p>
                                  <p className="text-[11px] text-white/45">
                                    {t.goal} · 截止 {t.deadline ?? "无"}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          )}
        </div>

        {/* Input — 仅当用户已创建财富画像时显示。
            没有画像的引导由上方 NoFinancialData 接管（创建按钮直跳 /onboarding/wealth），
            此处不再展示灰底 placeholder 输入框，避免歧义。 */}
        {hasProfile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="pt-3"
          >
            <div className="glass rounded-2xl p-2 flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder='向 AI 财富顾问提问：例如"如果我买房会怎样？"或"我如何能在 40 岁退休？"'
                rows={1}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-white/30 resize-none outline-none"
                disabled={processing}
              />
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || processing}
                className="h-10 w-10 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
