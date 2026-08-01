/**
 * Agent Task Scheduler（Phase 6.5 六）—— 任务优先级调度。
 *
 * 三类优先级：
 *   - P1 用户主动请求（如点击「重新分析」）：立即执行
 *   - P2 数据重大变化（changeScore=high）：后台执行重新分析
 *   - P3 每日财富检查：低优先级
 *
 * 进程内单例优先级队列，限制并发，保证高优任务先跑、失败不影响主流程。
 */
import "server-only";

export type TaskPriority = 1 | 2 | 3;

export interface ScheduledTask {
  id: string;
  priority: TaskPriority;
  userId: string;
  label: string;
  run: () => Promise<void>;
}

class AgentScheduler {
  private queue: ScheduledTask[] = [];
  private running = 0;
  private readonly maxConcurrent = 2;

  enqueue(task: ScheduledTask): void {
    this.queue.push(task);
    // 高优先级（数字小）排前；同优先级保持入队顺序（稳定）
    this.queue.sort((a, b) => a.priority - b.priority);
    this.pump();
  }

  private pump(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running += 1;
      task
        .run()
        .catch((err) => {
          // 调度任务失败不应影响主流程（与监控降级策略一致）
          console.error(`[scheduler] task ${task.id} (${task.label}) failed:`, err);
        })
        .finally(() => {
          this.running -= 1;
          this.pump();
        });
    }
  }

  /** 当前等待中的任务数（可观测性）。 */
  pendingCount(): number {
    return this.queue.length;
  }
}

export const scheduler = new AgentScheduler();
