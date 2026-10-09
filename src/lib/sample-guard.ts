/**
 * 示例数据守卫：`SAMPLE-` 前缀的记录只属于本地演示，绝不允许推送到服务端账号。
 * 集中在此以便单测与复用。
 */
export function shouldSyncEntityId(id: unknown): boolean {
  return !String(id ?? "").startsWith("SAMPLE-");
}
