/**
 * 有容量上限的 Map：超过上限时按插入顺序淘汰最旧的键（近似 LRU）。
 *
 * 用于按工作区缓存配置，避免长期运行的服务为每个匿名工作区永久保留内存。
 * 淘汰后，下一次读取会从磁盘重新加载，因此不会丢失数据。
 */
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly maxSize: number) {
    super();
  }

  override set(key: K, value: V): this {
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    if (super.size > this.maxSize) {
      const oldest = super.keys().next().value;
      if (oldest !== undefined) super.delete(oldest);
    }
    return this;
  }

  /** 命中并刷新为最新（LRU 语义）。 */
  touch(key: K): V | undefined {
    if (!super.has(key)) return undefined;
    const value = super.get(key) as V;
    super.delete(key);
    super.set(key, value);
    return value;
  }
}
