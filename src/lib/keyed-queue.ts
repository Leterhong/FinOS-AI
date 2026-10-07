/**
 * 按 key 串行化的异步任务队列。
 *
 * 同一 key 上的操作依次执行（读-改-写不互相覆盖）；队列排空后自动删除该 key，
 * 避免长期运行的服务为每个访问过的工作区永久保留一条 Promise。
 */
export class KeyedQueue {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.finally(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return run;
  }

  /** 当前仍在排队的 key 数量（用于测试与观测）。 */
  get size(): number {
    return this.tails.size;
  }
}
