import "server-only";

import fs from "node:fs";
import path from "node:path";
import type {
  WealthTask,
  WealthTaskInput,
  TaskManagerState,
  WealthTaskStatus,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data", "tasks");
const DEFAULT_USER = "default-user";

function sid(): string {
  return `task-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}
function sanitize(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || DEFAULT_USER;
}

/**
 * Wealth Task System（Phase 5 二）。
 *
 *  - 按 userId 隔离持久化，每用户独立文件 `.data/tasks/{userId}.json`；
 *  - 提供 createTask / updateTask / completeTask / getTasks 全套 CRUD；
 *  - 任务可来自 Action Agent、Plan Generator、Copilot 或 Chat；
 *  - 用户完成任务后由 Store 调用 completeTask，并同步写入 Execution Memory。
 */
class TaskManager {
  private empty(userId: string): TaskManagerState {
    return { userId, tasks: [] };
  }

  private fileOf(userId: string): string {
    return path.join(DATA_DIR, `${sanitize(userId)}.json`);
  }

  private load(userId: string): TaskManagerState {
    try {
      const fp = this.fileOf(userId);
      if (fs.existsSync(fp)) {
        const parsed = JSON.parse(fs.readFileSync(fp, "utf-8")) as TaskManagerState;
        if (parsed && parsed.userId) {
          return { ...this.empty(userId), ...parsed, tasks: parsed.tasks ?? [] };
        }
      }
    } catch {
      /* 损坏文件：从空开始 */
    }
    return this.empty(userId);
  }

  private persist(userId: string, state: TaskManagerState): void {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(this.fileOf(userId), JSON.stringify(state), "utf-8");
    } catch {
      /* 持久化失败不影响本次会话 */
    }
  }

  /** 列出用户全部任务（最新在前）。 */
  list(userId: string): WealthTask[] {
    return this.load(userId).tasks;
  }

  get(userId: string, id: string): WealthTask | undefined {
    return this.load(userId).tasks.find((t) => t.id === id);
  }

  /** 按状态过滤（默认全部）。 */
  filterByStatus(userId: string, status?: WealthTaskStatus): WealthTask[] {
    const all = this.list(userId);
    return status ? all.filter((t) => t.status === status) : all;
  }

  /** 按类别过滤。 */
  filterByCategory(userId: string, category: WealthTask["category"]): WealthTask[] {
    return this.list(userId).filter((t) => t.category === category);
  }

  /** 创建单条任务。 */
  create(
    userId: string,
    input: WealthTaskInput
  ): WealthTask {
    const full: WealthTask = {
      ...input,
      id: sid(),
      userId,
      status: input.status ?? "pending",
      createdAt: Date.now(),
    };
    const state = this.load(userId);
    state.tasks = [full, ...state.tasks];
    this.persist(userId, state);
    return full;
  }

  /** 批量创建任务（Action Agent 拆产物 / Plan Generator 产物）。 */
  createMany(userId: string, inputs: WealthTaskInput[]): WealthTask[] {
    const now = Date.now();
    const created: WealthTask[] = inputs.map((input) => ({
      ...input,
      id: sid(),
      userId,
      status: input.status ?? "pending",
      createdAt: now,
    }));
    const state = this.load(userId);
    state.tasks = [...created, ...state.tasks];
    this.persist(userId, state);
    return created;
  }

  /** 更新任务字段（标题 / 描述 / 状态 / 截止日等）。 */
  update(
    userId: string,
    id: string,
    updates: Partial<WealthTask>
  ): WealthTask | undefined {
    const state = this.load(userId);
    const idx = state.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return undefined;
    const updated: WealthTask = { ...state.tasks[idx], ...updates, id, userId };
    state.tasks[idx] = updated;
    this.persist(userId, state);
    return updated;
  }

  /** 标记任务完成（写 completedAt）。 */
  complete(userId: string, id: string): WealthTask | undefined {
    return this.update(userId, id, {
      status: "done",
      completedAt: Date.now(),
    });
  }

  /** 移除任务。 */
  remove(userId: string, id: string): boolean {
    const state = this.load(userId);
    const before = state.tasks.length;
    state.tasks = state.tasks.filter((t) => t.id !== id);
    if (state.tasks.length === before) return false;
    this.persist(userId, state);
    return true;
  }
}

export const taskManager = new TaskManager();
