# FinOS AI — 未解决风险及待验证问题（V1）

以下风险**已知、已评估、暂不在本轮修复**，每项附原因与建议方案。它们不是已确认的可利用漏洞，而是需要业务决策或后续投入的事项。

---

## R-01 (P2) bootstrap 无认证创建 guest 用户行——数据库膨胀面 【已缓解 2026-11-06；动态渗透 PT-01 确认利用面并验证缓解有效】

- 现状：每次无 Cookie 的冷访问调用 `POST /api/auth/bootstrap` 都会创建一个 guest `User` 行（bcrypt 随机密码），仅靠 60/min/IP 限流约束。单 IP 理论上每天可制造 86,400 个孤儿用户。
- **已实施缓解**：`backend/security/guest_cleanup.py` + `GUEST_CLEANUP_DAYS` 环境变量（默认 0 = 关闭）。开启后启动期删除同时满足以下全部条件的访客：①邮箱匹配 guest 前缀；②创建超过 N 天；③名下无任何业务数据（元数据驱动全表扫描，新表自动纳入）；④无活跃 refresh 会话。非 guest 前缀的注册用户绝不触碰。回归测试 `test_guest_cleanup_removes_empty_old_guest_only` 覆盖边界（空访客删除 / 有数据保留 / 未过期保留 / 非 guest 保留 / 开关关闭零操作）。
- 残余：默认仍为关闭，部署者需显式设置 `GUEST_CLEANUP_DAYS`（如 30）才生效——保留人工决策权以控制不可逆删除。

## R-02 (P3) 前端工作区会话无服务端吊销 【已缓解 2026-11-06】

- **已实施缓解**：`src/auth/revocation.ts` 按 userId 记录「吊销时间戳」——`/api/account/purge` 与 `/api/workspace/session?reset=true` 触发吊销；`getSessionUserId` 校验 iat 早于吊销时间戳的会话一律拒绝。覆盖该用户全部旧 token（无需逐 token 记录）。
- 存储为进程内 Map：自托管单实例（默认形态）下有效；多实例部署需替换为 Redis 共享存储（接口收敛在 revocation.ts 两个函数内）。残余：登出前已被窃取的 token 在吊销前仍可用（与所有无状态会话方案相同的固有限制）。

## R-03 (P3) 遗留端点面在误配置下扩大 【已加固 2026-11-06】

- **已实施加固**：`backend/main.py` 在非 debug 环境检测到 `ENABLE_LEGACY_MODULES=1` 时输出显式 warning（含暴露面说明），误配置在日志中可见。开关默认仍为关闭。
- 残余：告警非强制阻断——如需硬关闭可将警告升级为启动失败（属行为变更，暂缓）。

## R-04 (Info) CSP 仍允许 unsafe-inline / unsafe-eval

- 现状：强制 CSP 已落地（本轮 V-02），但策略允许内联脚本/样式与 eval（Next.js 运行时与内联主题脚本需要）。
- 建议：后续将内联主题脚本抽为外部文件 + nonce，逐步收紧至不含 unsafe-*。

## R-05 (Info) HSTS 仅 TLS 部署启用

- 现状：HSTS 在 nginx TLS 站点配置中；HTTP-only 本地部署与 next.config/backend 均无。
- 建议：保持现状（HTTP 开发环境启用 HSTS 反而可能导致 localhost 被浏览器强制 HTTPS）。

## R-06 (Info) 限流仅按 IP 维度

- 现状：滑动窗口限流（Redis/降级进程内）仅按 IP；企业 NAT 出口下多用户共享配额。
- 建议：认证后按 user_id 追加独立配额桶（中间件需感知认证态）。

## R-07 (Info) Python 依赖无 lockfile / pytest 在生产 requirements 【已部分缓解 2026-11-06】

- **已实施**：pytest 拆分至 `backend/requirements-dev.txt`（生产镜像与 e2e job 仅装生产依赖；后端 CI job 装开发依赖）。生产镜像不再携带 pytest。
- 残余：11 个依赖仍无上界、无 pip lockfile——引入 pip-tools 需单独验证构建兼容性，避免盲目升级。

## R-08 (Info) LEGACY_ENCRYPTION_KEY 回退派生自 JWT_SECRET 【已加固 2026-11-06】

- **已实施加固**：`backend/core/security.py:_legacy_fernet` 在未设置独立密钥时输出显式 warning（密钥分离违规提示），部署误配置在日志中可见。回退行为保留（历史密文兼容）。
- 建议：部署时仍应显式设置 `LEGACY_ENCRYPTION_KEY` 以消除告警。

## R-09 (Info) access jti 吊销缓存仅在无 Redis 时为进程内 【勘误 2026-11-06】

- 勘误：初版清单误记为「进程内」。实际实现走 `backend.core.cache`（`security.py:90-108`）——部署 Redis 时吊销跨 worker 共享；仅 Redis 不可用降级时为进程内（影响窗口受 15 分钟 TTL 限制，refresh 已数据库级家族吊销）。
- 结论：生产部署（compose 含 Redis）下无需修复；仅纯 SQLite+无 Redis 的单机降级模式存在该限制。

## R-10 (Info) 治理邀请令牌经邮件/链接明文传递

- 现状：本轮已实现「用后即从地址栏清除」（V-06），但 token 在传输链路（邮件正文、浏览器历史清除前）仍可能被截获。
- 建议：长期可改为站内通知 + 登录后一次性接受（不经过 URL token）。

## R-11 (Info) 模型 base_url 允许私网地址（显式放行时）

- 现状：`AI_ALLOW_PRIVATE_ENDPOINTS=true`（或 dev 默认）允许指向内网 Ollama 等；云元数据段始终封死。部署者显式开启即声明接受内网可达性。
- 建议：文档强化「仅在隔离网络内开启」。
