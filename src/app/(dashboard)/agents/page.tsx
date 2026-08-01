"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import { useFinancialStore } from "@/store/financial-store";
import {
  useAgentTasks,
  useAgentsMarket,
  useConfigureAgents,
  useRunSingle,
  hasBackendToken,
} from "@/hooks/use-backend";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/lib/backend-client";
import type { AgentConfigureBody, AgentMeta, MarketplaceResult } from "@/types/agents";
import { Skeleton } from "@/components/ui/skeleton";

import AgentPipeline from "@/components/agents/AgentPipeline";
import AgentCard from "@/components/agents/AgentCard";
import AgentNetwork from "@/components/agents/AgentNetwork";
import ToolTrace from "@/components/agents/ToolTrace";
import { SimulatedDataNotice } from "@/components/ui/SimulatedDataNotice";
import { hasSimulatedToolData } from "@/ai/tools/types";
import GradientText from "@/components/ui/GradientText";
import { Button } from "@/components/ui/button";
import NoFinancialData from "@/components/dashboard/NoFinancialData";
import {
  Play,
  FileText,
  ArrowRight,
  Brain,
  Loader2,
  Bot,
  Wrench,
  AlertCircle,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";

const defaultQuestion = "我希望在 40 岁前退休，我需要做些什么？";

const agentNameMap: Record<string, string> = {
  planner: "财富规划 Agent",
  cashflow: "现金流分析 Agent",
  investment: "投资规划 Agent",
  risk: "风险评估 Agent",
  retirement: "退休规划 Agent",
  strategy: "财富策略 Agent",
  summary: "综合总结 Agent",
};

/** 领域标签中文化（后端 domain 字段为英文枚举，缺失时回退原值）。 */
const agentDomainLabel: Record<string, string> = {
  cashflow: "现金流",
  investment: "投资",
  risk: "风险",
  retirement: "退休",
  tax: "税务",
  insurance: "保险",
  planning: "规划",
  strategy: "策略",
  summary: "总结",
  debt: "负债",
  estate: "传承",
};

/**
 * 纯 Tailwind 开关（项目 ui/ 下无 switch 组件，此处手写）。
 * 开启态使用财富绿 #00D68F 轨道，关闭态为中性灰。
 */
function AgentToggle({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-success/50 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-semantic-success" : "bg-white/15"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-[19px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

export default function AgentCenterPage() {
  const profile = useFinancialStore((s) => s.profile);
  const workflowPhase = useFinancialStore((s) => s.workflowPhase);
  const workflowTasks = useFinancialStore((s) => s.workflowTasks);
  const agentStates = useFinancialStore((s) => s.agentStates);
  const workflowResults = useFinancialStore((s) => s.workflowResults);
  const isWorkflowRunning = useFinancialStore((s) => s.isWorkflowRunning);
  const toolCalls = useFinancialStore((s) => s.toolCalls);
  const runWorkflow = useFinancialStore((s) => s.runWorkflow);
  const resetWorkflow = useFinancialStore((s) => s.resetWorkflow);
  const workflowGoalLabel = useFinancialStore((s) => s.workflowGoalLabel);
  const profileStatus = useFinancialStore((s) => s.profileStatus);

  const completed = workflowPhase === "complete";

  // ── Phase 7.0.2 追加：后端 Agent 编排任务（独立数据通道，不改动上方工作流可视化）──
  const agentTasksQuery = useAgentTasks();
  const qc = useQueryClient();
  const runBackendAgent = useMutation({
    mutationFn: () => backendApi.agent.run("analysis", defaultQuestion),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent", "tasks"] }),
  });
  const backendTasks = Array.isArray(agentTasksQuery.data)
    ? (agentTasksQuery.data as Array<Record<string, unknown>>)
    : Array.isArray((agentTasksQuery.data as Record<string, unknown> | null)?.tasks)
      ? ((agentTasksQuery.data as Record<string, unknown>).tasks as Array<Record<string, unknown>>)
      : [];

  // ── Phase 7.3 追加：智能体启用管理（/agents/market + PUT /agents/market/{name}）──
  const backendReady = hasBackendToken();
  const marketQuery = useAgentsMarket();
  const configureAgent = useConfigureAgents();
  const runSingle = useRunSingle();

  /** 本地乐观覆盖层：key = agent.name，未命中则以服务端 enabled 为准。 */
  const [enabledOverrides, setEnabledOverrides] = useState<Record<string, boolean>>({});
  const [runningAgent, setRunningAgent] = useState<string | null>(null);

  const marketAgents: AgentMeta[] = useMemo(() => {
    const items = (marketQuery.data as MarketplaceResult | undefined)?.items;
    return Array.isArray(items) ? items : [];
  }, [marketQuery.data]);

  const isAgentEnabled = useCallback(
    (agent: AgentMeta): boolean =>
      enabledOverrides[agent.name] ?? agent.enabled ?? agent.defaultEnabled ?? true,
    [enabledOverrides]
  );

  const enabledAgents = useMemo(
    () => marketAgents.filter((a) => isAgentEnabled(a)),
    [marketAgents, isAgentEnabled]
  );

  /** 切换单个智能体：乐观更新 UI，后端可用时持久化，失败则回滚。 */
  const toggleAgent = useCallback(
    (agent: AgentMeta, next: boolean): void => {
      setEnabledOverrides((prev) => ({ ...prev, [agent.name]: next }));
      if (!backendReady) return;
      const payload: AgentConfigureBody = { enabled: next };
      configureAgent.mutate(
        { name: agent.name, payload },
        {
          onError: () =>
            setEnabledOverrides((prev) => ({ ...prev, [agent.name]: !next })),
        }
      );
    },
    [backendReady, configureAgent]
  );

  /** 批量启用 / 停用：仅对状态确实发生变化的智能体发起持久化请求。 */
  const setAllAgents = useCallback(
    (next: boolean): void => {
      const changed = marketAgents.filter((a) => isAgentEnabled(a) !== next);
      if (changed.length === 0) return;
      setEnabledOverrides((prev) => {
        const draft = { ...prev };
        for (const a of marketAgents) draft[a.name] = next;
        return draft;
      });
      if (!backendReady) return;
      const payload: AgentConfigureBody = { enabled: next };
      for (const a of changed) configureAgent.mutate({ name: a.name, payload });
    },
    [marketAgents, isAgentEnabled, backendReady, configureAgent]
  );

  const handleRunSingle = useCallback(
    (agent: AgentMeta): void => {
      setRunningAgent(agent.name);
      runSingle.mutate(
        { name: agent.name, question: defaultQuestion },
        { onSettled: () => setRunningAgent(null) }
      );
    },
    [runSingle]
  );

  // Phase 5.9：未加载真实财富画像时，禁止展示任何默认档案信息 / 启动 Agent 分析。
  // （Agent 启动条件：userId 存在 + financialProfile 存在 + 用户主动触发 —— 此处先确保 profile 存在。）
  if (profileStatus !== "loaded") {
    return (
      <PageTransition>
        <NoFinancialData
          title="你好，我还不了解你的财富情况"
          subtitle="创建你的财富画像后，AI 智能体才能基于你的真实财务数据并行分析并生成策略。"
        />
      </PageTransition>
    );
  }

  const handleRun = () => {
    resetWorkflow();
    setTimeout(() => runWorkflow(defaultQuestion), 100);
  };

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-semantic-success/70 mb-2">
            多智能体系统
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            <GradientText>AI 智能体中心</GradientText>
          </h1>
          <p className="mt-2 text-sm text-white/40 max-w-2xl">
            观察专项财务智能体如何通过结构化工作流实时协作：
            财富规划 → 并行分析 → 财富策略 → 综合总结。财富规划 Agent 将您的目标拆解为任务，各分析智能体并行执行，财富策略 Agent 综合生成年度行动计划，最后由综合总结 Agent 汇总。
          </p>
        </motion.div>

        {/* Phase 7.3：智能体启用管理（/agents/market） */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="glass rounded-2xl p-6 glow-ring"
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-semantic-success" />
                <h2 className="text-base font-semibold text-white">智能体启用管理</h2>
              </div>
              <p className="mt-1 text-sm text-white/40">
                控制哪些 AI 智能体参与你的财富分析
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-full border border-semantic-success/25 bg-semantic-success/10 px-3 py-1 text-[11px] text-semantic-success">
                已启用 {enabledAgents.length} / 共 {marketAgents.length} 个智能体
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={marketAgents.length === 0 || enabledAgents.length === marketAgents.length}
                onClick={() => setAllAgents(true)}
              >
                全部启用
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={marketAgents.length === 0 || enabledAgents.length === 0}
                onClick={() => setAllAgents(false)}
              >
                全部停用
              </Button>
            </div>
          </div>

          {!backendReady ? (
            <p className="text-xs text-white/30">
              未检测到后端鉴权 token（finos_token），无法读取智能体市场。请先登录以管理智能体启用状态。
            </p>
          ) : marketQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-5 w-9 rounded-full" />
                  </div>
                  <Skeleton className="mt-3 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-3/4" />
                  <div className="mt-4 flex gap-2">
                    <Skeleton className="h-5 w-14 rounded-md" />
                    <Skeleton className="h-5 w-14 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : marketQuery.isError ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-white/40" />
              <p className="text-xs text-white/50">
                智能体市场加载失败，启用管理暂不可用。页面其余分析功能不受影响。
              </p>
            </div>
          ) : marketAgents.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <Bot className="h-4 w-4 shrink-0 text-white/30" />
              <p className="text-xs text-white/40">
                暂无可用智能体。后端智能体市场尚未注册任何 Agent。
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {marketAgents.map((agent, i) => {
                  const on = isAgentEnabled(agent);
                  const tools = Array.isArray(agent.tools) ? agent.tools : [];
                  const running = runningAgent === agent.name;
                  return (
                    <motion.div
                      key={agent.name}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.05 + i * 0.04 }}
                      className={`flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.05] ${
                        on ? "" : "opacity-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {agent.title || agentNameMap[agent.name] || agent.name}
                          </p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/30">
                            {agentDomainLabel[agent.domain] ?? agent.domain ?? agent.name}
                          </p>
                        </div>
                        <AgentToggle
                          checked={on}
                          disabled={configureAgent.isPending}
                          onToggle={() => toggleAgent(agent, !on)}
                          label={`${agent.title || agent.name} 启用开关`}
                        />
                      </div>

                      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-white/50">
                        {agent.description || "该智能体暂无描述。"}
                      </p>

                      {tools.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <Wrench className="h-3 w-3 shrink-0 text-white/25" />
                          {tools.slice(0, 3).map((tool) => (
                            <span
                              key={tool}
                              className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/40"
                            >
                              {tool}
                            </span>
                          ))}
                          {tools.length > 3 && (
                            <span className="text-[10px] text-white/25">
                              +{tools.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] ${
                            on ? "text-semantic-success" : "text-white/30"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              on ? "bg-semantic-success" : "bg-white/25"
                            }`}
                          />
                          {on ? "已启用" : "已停用"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!on || running}
                          onClick={() => handleRunSingle(agent)}
                        >
                          {running ? (
                            <>
                              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                              运行中…
                            </>
                          ) : (
                            <>
                              <Play className="mr-1.5 h-3 w-3" />
                              单独运行
                            </>
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <p className="mt-4 text-[11px] text-white/25">
                启用状态通过 PUT /agents/market/{"{name}"} 持久化到后端账户配置，跨会话生效。
                下方前端工作流可视化为本地演示链路，不受此处开关影响。
              </p>
            </>
          )}
        </motion.section>

        {/* 智能体节点网络可视化 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass rounded-2xl p-6 glow-ring"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-white/40">
              智能体协同拓扑
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-semantic-success/30 bg-semantic-success/10 px-2.5 py-1 text-[11px] text-semantic-success">
              <span className="h-1.5 w-1.5 rounded-full bg-semantic-success" />
              5 / 5 在线
            </span>
          </div>
          <AgentNetwork />
        </motion.div>

        {/* Prompt card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="glass rounded-2xl p-6 glow-ring"
        >
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-4 w-4 text-brand-electric" />
                <p className="text-[10px] uppercase tracking-widest text-white/40">用户目标</p>
              </div>
              <p className="text-lg font-medium text-white">
                &ldquo;{defaultQuestion}&rdquo;
              </p>
              <p className="mt-1 text-sm text-white/40">
                基于 {profile.name} 的财务档案 · 年龄 {profile.age}
                {workflowGoalLabel && (
                  <span className="ml-2 text-semantic-success">· 目标：{workflowGoalLabel}</span>
                )}
              </p>
              {backendReady && marketAgents.length > 0 && (
                <p className="mt-1.5 text-xs text-white/30">
                  当前启用范围：
                  <span className="text-semantic-success">
                    {enabledAgents.length} / {marketAgents.length}
                  </span>{" "}
                  个智能体
                  {enabledAgents.length > 0 && (
                    <span className="text-white/25">
                      （{enabledAgents
                        .slice(0, 3)
                        .map((a) => a.title || a.name)
                        .join("、")}
                      {enabledAgents.length > 3 ? ` 等 ${enabledAgents.length} 个` : ""}）
                    </span>
                  )}
                </p>
              )}
            </div>
            <Button
              size="lg"
              onClick={handleRun}
              disabled={isWorkflowRunning}
              className="shrink-0"
            >
              {isWorkflowRunning ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full mr-2"
                  />
                  分析中……
                </>
              ) : completed ? (
                <>
                  <Play className="h-4 w-4 mr-2 fill-current" />
                  重新分析
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2 fill-current" />
                  开始分析
                </>
              )}
            </Button>
          </div>
        </motion.div>

        {/* Planner tasks display */}
        {workflowTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6"
          >
            <p className="text-xs uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
              <Brain className="h-3.5 w-3.5" />
              规划任务
            </p>
            <div className="space-y-2">
              {workflowTasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3"
                >
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      task.status === "done"
                        ? "bg-semantic-success/20 text-semantic-success"
                        : task.status === "running"
                        ? "bg-brand-electric/20 text-brand-electric animate-pulse"
                        : "bg-white/10 text-white/40"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className="text-sm text-white/80 flex-1">{task.description}</span>
                  <span className="text-[10px] uppercase tracking-wider text-white/30">
                    {agentNameMap[task.assignedAgent] ?? task.assignedAgent}
                  </span>
                  {task.status === "done" && (
                    <span className="text-semantic-success text-xs">✓</span>
                  )}
                  {task.status === "running" && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="h-3 w-3 border-2 border-white/20 border-t-brand-electric rounded-full"
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Pipeline visualization */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="glass rounded-2xl p-8"
        >
          <p className="text-xs uppercase tracking-widest text-white/40 text-center mb-8">
            智能体执行链路
          </p>
          <AgentPipeline state={agentStates} large />

          {/* Current status message */}
          {isWorkflowRunning && workflowPhase === "recognizing-goal" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-8 text-center"
            >
              <motion.p
                className="text-sm text-brand-electric"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                🔍 正在识别您的财务目标……
              </motion.p>
            </motion.div>
          )}
          {isWorkflowRunning && workflowPhase === "planning" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-8 text-center"
            >
              <motion.p
                className="text-sm text-semantic-success"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                🧠 规划器正在将目标拆解为智能体任务……
              </motion.p>
            </motion.div>
          )}
          {isWorkflowRunning && workflowPhase === "executing" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-8 text-center"
            >
              <motion.p
                className="text-sm text-brand-electric"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                ⚡ 智能体正在分析您的财务数据……
              </motion.p>
            </motion.div>
          )}
          {isWorkflowRunning && workflowPhase === "summarizing" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-8 text-center"
            >
              <motion.p
                className="text-sm text-semantic-success"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                正在将结果合成为策略……
              </motion.p>
            </motion.div>
          )}

          {completed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8 text-center"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-semantic-success/15 px-4 py-2 text-sm text-semantic-success">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="h-2 w-2 rounded-full bg-semantic-success"
                />
                工作流完成 · 已基于 {workflowResults.length} 个智能体生成策略
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* AI Tool Trace（Phase 3.4）：工具调用记录 */}
        {completed && toolCalls.length > 0 && (
          <div className="space-y-3">
            <SimulatedDataNotice simulated={hasSimulatedToolData(toolCalls)} />
            <ToolTrace records={toolCalls} />
          </div>
        )}

        {/* Results */}
        {completed && workflowResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">分析结果</h2>
              <Link href="/report">
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  生成完整报告
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {workflowResults.map((r, i) => (
                <AgentCard key={r.agent} analysis={r} delay={i * 0.1} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Phase 7.0.2：后端 Agent 编排任务（backendApi.agent，独立数据通道） */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="glass rounded-2xl p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-semantic-success" />
              <p className="text-sm font-semibold">后端 Agent 编排任务</p>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
                backendApi · /agent/tasks
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasBackendToken() || runBackendAgent.isPending}
              onClick={() => runBackendAgent.mutate()}
            >
              {runBackendAgent.isPending ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  提交中…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-3.5 w-3.5" />
                  派发后端任务
                </>
              )}
            </Button>
          </div>

          {!hasBackendToken() ? (
            <p className="text-xs text-white/30">
              未检测到后端鉴权 token（finos_token），后端通道未启用。请先登录以接入统一后端。
            </p>
          ) : agentTasksQuery.isLoading ? (
            <p className="text-xs text-white/30">加载后端任务列表…</p>
          ) : backendTasks.length === 0 ? (
            <p className="text-xs text-white/30">
              暂无后端编排任务。点击「派发后端任务」通过 FastAPI 提交分析任务（与上方前端工作流相互独立）。
            </p>
          ) : (
            <div className="space-y-2">
              {backendTasks.map((t, i) => (
                <div
                  key={(t.id as string) ?? i}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white/80">
                      {String(t.task_type ?? t.type ?? "任务")}
                    </p>
                    <p className="text-[10px] text-white/30">
                      {(t.id as string) ?? ""}
                      {(t.status as string) ? ` · ${String(t.status)}` : ""}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/40">
                    {String(t.status ?? "—")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </PageTransition>
  );
}
