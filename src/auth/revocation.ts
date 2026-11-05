import "server-only";

/**
 * 工作区会话服务端吊销（R-02 缓解）。
 *
 * 设计：按 userId 记录「吊销时间戳」——凡 iat 早于该时间戳的会话一律拒绝。
 * 相比逐 token 记录，按用户 + 时间戳的语义可以覆盖该用户的所有旧会话，
 * 且登出/清洗只需写一条记录。
 *
 * 存储为进程内 Map：自托管单实例部署（本项目默认形态）下跨请求共享；
 * 多实例部署需换 Redis 等共享存储（接口已收敛在两个函数内，替换成本低）。
 * 记录数量与登出/清洗频次同级，内存占用可忽略。
 */

const revokedBefore = new Map<string, number>();

/** 吊销该用户当前所有会话：此后 iat 早于调用时刻的 token 一律无效。 */
export function revokeWorkspaceSessions(userId: string): void {
  if (!userId) return;
  revokedBefore.set(userId, Date.now());
}

/** 该用户的会话是否已被吊销（iat 早于吊销时间戳）。 */
export function isWorkspaceSessionRevoked(userId: string, issuedAtMs: number): boolean {
  const threshold = revokedBefore.get(userId);
  return threshold !== undefined && issuedAtMs < threshold;
}
