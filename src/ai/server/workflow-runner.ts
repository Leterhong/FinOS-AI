import "server-only";

import { workflowEngine } from "../services/WorkflowEngine";
import type { WorkflowEvent, WorkflowState } from "../types";
import type { WorkflowInput } from "../services/WorkflowEngine";
import { runWithModelContext } from "../model-center/context";

/**
 * 在服务端运行完整 Agent 工作流，并通过 `emit` 把每个阶段事件流式推送给客户端
 * （SSE）。所有 LLM 调用都在此服务端上下文中发生 —— 密钥只在服务端读取，
 * 永远不会进入客户端 bundle。
 *
 * 调用链：
 *   Route Handler → runWorkflowWithEmitter → WorkflowEngine
 *     → Agent → AIService → ModelRouter → Provider → LLM
 */
export async function runWorkflowWithEmitter(
  input: WorkflowInput,
  emit: (event: WorkflowEvent) => void
): Promise<WorkflowState> {
  // 在用户模型上下文中运行整条工作流：所有 Agent 的 LLM 调用自动走用户配置模型。
  return runWithModelContext(input.userId, () => runInner(input, emit));
}

async function runInner(
  input: WorkflowInput,
  emit: (event: WorkflowEvent) => void
): Promise<WorkflowState> {
  const state = await workflowEngine.run(input, {
    onPhaseChange: (phase) => emit({ type: "phase", phase }),
    onGoalRecognized: (goal) => emit({ type: "goal", goal }),
    onTasksPlanned: (tasks) => emit({ type: "tasks", tasks }),
    onTaskStart: (task) => emit({ type: "task-start", task }),
    onTaskComplete: (task, result) => emit({ type: "task-complete", task, result }),
    onSummaryComplete: (summary) => emit({ type: "summary", summary }),
    onToolCalls: (records) => emit({ type: "tool-calls", records }),
    onTwinUpdate: (snapshot) => emit({ type: "twin-update", snapshot }),
    onError: (error) => emit({ type: "error", message: error.message }),
  });
  return state;
}
