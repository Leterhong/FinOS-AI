/**
 * AI Orchestrator（Phase 6.5 二）—— AI 任务总控制器。
 *
 * 一次「分析请求」的完整决策流：
 *   1. 路由：推断需要哪些 Agent（按需，而非全量并发）
 *   2. 预算：调用 LLM 前检查用户额度，超限则降级到旧缓存
 *   3. 缓存：命中且未过期 → 直接返回缓存，0 次 LLM 调用
 *   4. 执行：未命中 → 跑工作流（仅所选 Agent）→ 写入缓存
 *   5. 降级：LLM 失败 → 返回最近一次同类型缓存
 *
 * 该模块必须服务端运行（访问密钥、文件系统、用量审计）。
 */
import "server-only";

import type { WorkflowEvent, WorkflowState, AgentAnalysisOutput, AITask } from "../types";
import { runWorkflowWithEmitter } from "../server/workflow-runner";
import { getActiveModelSummary } from "@/ai/model-center/models/resolver";
import { routeRequest } from "./router";
import { getCache, setCache, getLatestByType, cacheTtl } from "./cache-manager";
import { checkBudget } from "./cost-manager";
import { hashInput } from "./hash";
import { compactProfile } from "./context-builder";
import type { AIAnalysisType, AgentId, OrchestrationRequest, OrchestrationResult } from "./types";

/** 把缓存结果当作「已完成的 Agent 分析」推送给前端（SSE 体验一致）。 */
function emitCached(result: AgentAnalysisOutput[], emit?: (e: WorkflowEvent) => void): void {
  if (!emit) return;
  for (const r of result) {
    const agent = r.agentId as AgentId;
    const base: AITask = {
      id: `cache-${agent}`,
      goalType: "general-question",
      description: "（读取缓存结果）",
      taskType: "analysis",
      assignedAgent: agent,
      status: "running",
    };
    emit({ type: "task-start", task: { ...base, status: "running" } } as WorkflowEvent);
    emit({
      type: "task-complete",
      task: { ...base, status: "done" },
      result: r,
    } as WorkflowEvent);
  }
  emit({
    type: "done",
    state: {
      id: "cache",
      phase: "complete",
      tasks: [],
      results: result,
      startedAt: Date.now(),
      completedAt: Date.now(),
    } as WorkflowState,
  } as WorkflowEvent);
}

export async function orchestrate(req: OrchestrationRequest): Promise<OrchestrationResult> {
  const { question, profile, userId, agents: forcedAgents, force, emit, memoryContext } = req;

  // 1) 路由：推断类型与所需 Agent
  const routed = routeRequest(question);
  const agents: AgentId[] =
    forcedAgents && forcedAgents.length ? forcedAgents : routed.agents;
  const finalType: AIAnalysisType =
    forcedAgents && forcedAgents.length ? req.type : routed.type;

  // 模型名（用于缓存键与可观测性）
  let modelName = "unknown";
  try {
    const m = await getActiveModelSummary(userId);
    modelName = m.modelName || "unknown";
  } catch {
    modelName = "unknown";
  }

  // Phase 6.6：记忆上下文非空时参与缓存键 —— 记忆变化自动使旧缓存失效；
  // 无记忆用户的哈希与 Phase 6.5 完全一致（向后兼容既有缓存与验收脚本）。
  const hashParts = [
    userId,
    finalType,
    question,
    JSON.stringify(compactProfile(profile)),
    modelName,
  ];
  if (memoryContext) hashParts.push(memoryContext);
  const inputHash = hashInput(...hashParts);

  // 2) 缓存优先（聊天不缓存；force 忽略缓存）
  const useCache = finalType !== "chat" && !force;
  if (useCache) {
    const hit = await getCache(userId, finalType, inputHash);
    if (hit) {
      emitCached(hit.result, emit);
      return {
        fromCache: true,
        type: finalType,
        result: hit.result,
        modelName: hit.modelName,
        createdAt: hit.createdAt,
        tokenUsage: hit.tokenUsage,
      };
    }
  }

  // 3) 预算闸门（仅真正要调 LLM 时检查）
  const budget = await checkBudget(userId);
  if (!budget.allowed) {
    const fallback = await getLatestByType(userId, finalType);
    if (fallback) {
      emitCached(fallback.result, emit);
      return {
        fromCache: true,
        degraded: true,
        type: finalType,
        result: fallback.result,
        modelName: fallback.modelName,
        createdAt: fallback.createdAt,
        tokenUsage: fallback.tokenUsage,
      };
    }
    throw new Error(budget.reason || "AI 调用额度已达上限");
  }

  // 4) 执行（仅所选 Agent）
  try {
    const state: WorkflowState = await runWorkflowWithEmitter(
      {
        question,
        profile,
        activeEvents: [],
        userId,
        selectedAgents: agents as string[],
        memoryContext,
      },
      (ev: WorkflowEvent) => {
        emit?.(ev);
      }
    );
    const result = state.results ?? [];

    // 5) 写入缓存（聊天除外）
    if (finalType !== "chat") {
      await setCache({
        id: `ac-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        userId,
        type: finalType,
        inputHash,
        modelName,
        result,
        createdAt: Date.now(),
        expireAt: Date.now() + cacheTtl(finalType),
      });
    }

    return {
      fromCache: false,
      type: finalType,
      result,
      state,
      modelName,
      createdAt: Date.now(),
    };
  } catch (err) {
    // 失败降级：返回最近一次同类型缓存（Phase 6.5 十四）
    const fallback = await getLatestByType(userId, finalType);
    if (fallback) {
      emitCached(fallback.result, emit);
      return {
        fromCache: true,
        degraded: true,
        type: finalType,
        result: fallback.result,
        modelName: fallback.modelName,
        createdAt: fallback.createdAt,
        tokenUsage: fallback.tokenUsage,
      };
    }
    throw err;
  }
}

/** Dashboard 读取最近一次分析结果（无 LLM）。 */
export async function getLatestAnalysis(userId: string) {
  const { getLatestAnalysisCache } = await import("./cache-manager");
  return getLatestAnalysisCache(userId);
}

export type { OrchestrationRequest, OrchestrationResult, AIAnalysisType, AgentId };
