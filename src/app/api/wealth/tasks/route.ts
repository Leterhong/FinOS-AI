import { NextRequest, NextResponse } from "next/server";
import { taskManager } from "@/wealth/tasks";
import { agentMemory } from "@/ai/memory";
import { getSessionUserId } from "@/auth/session";
import type { WealthTaskInput, WealthTaskStatus } from "@/wealth/tasks";

export const runtime = "nodejs";

/**
 * Wealth Task System CRUD（Phase 5 二/三）。userId 一律取自会话。
 *  GET    ?status&category         列出任务（可按状态/类别过滤）
 *  POST   { task | tasks }         创建单条 / 批量
 *  PATCH  { id, status|updates }   更新；status=done 时写 Execution Memory
 *  DELETE ?id                      删除
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const status = req.nextUrl.searchParams.get("status") as WealthTaskStatus | null;
  const category = req.nextUrl.searchParams.get("category");
  let list = taskManager.list(userId);
  if (status) list = list.filter((t) => t.status === status);
  if (category) list = list.filter((t) => t.category === category);
  return NextResponse.json({ tasks: list });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const body = (await req.json()) as {
      userId?: string;
      task?: WealthTaskInput;
      tasks?: WealthTaskInput[];
    };
    if (Array.isArray(body.tasks) && body.tasks.length > 0) {
      const created = taskManager.createMany(userId, body.tasks);
      return NextResponse.json({ tasks: created });
    }
    if (body.task) {
      const created = taskManager.create(userId, body.task);
      return NextResponse.json({ task: created });
    }
    return NextResponse.json({ error: "缺少 task / tasks" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const body = (await req.json()) as {
      userId?: string;
      id: string;
      status?: WealthTaskStatus;
      updates?: Partial<import("@/wealth/tasks").WealthTask>;
    };
    if (!body.id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }
    let task = undefined;
    if (body.status === "done") {
      task = taskManager.complete(userId, body.id);
      // 三：用户完成任务 → 更新 Execution Memory（Phase 5 九）
      if (task) {
        try {
          agentMemory.addExecutionMemory(userId, {
            kind: "task-completed",
            note: `完成任务「${task.title}」（${task.category}）`,
            taskId: task.id,
            goalType: goalTypeOf(task.goal),
          });
          const stats = agentMemory.getExecutionStats(userId);
          agentMemory.addExecutionMemory(userId, {
            kind: "execution-ability",
            note: `累计完成任务 ${stats.completed} 项，执行率 ${stats.completionRate}%。`,
            goalType: goalTypeOf(task.goal),
          });
        } catch {
          /* 持久化失败不影响本次完成 */
        }
      }
    } else {
      task = taskManager.update(userId, body.id, body.updates ?? {});
    }
    return NextResponse.json({ task: task ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const ok = taskManager.remove(userId, id);
  return NextResponse.json({ ok });
}

function goalTypeOf(goal: string): string {
  const g = goal.toLowerCase();
  if (g.includes("退休")) return "retirement";
  if (g.includes("房")) return "house-planning";
  if (g.includes("创业")) return "income-optimization";
  if (g.includes("教育") || g.includes("留学")) return "education";
  return "general";
}
