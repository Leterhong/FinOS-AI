# FinOS AI — 未解决风险及待验证问题（V1）

以下风险**已知、已评估、暂不在本轮修复**，每项附原因与建议方案。它们不是已确认的可利用漏洞，而是需要业务决策或后续投入的事项。

---

## R-01 (P2) bootstrap 无认证创建 guest 用户行——数据库膨胀面

- 现状：每次无 Cookie 的冷访问调用 `POST /api/auth/bootstrap` 都会创建一个 guest `User` 行（bcrypt 随机密码），仅靠 60/min/IP 限流约束。单 IP 理论上每天可制造 86,400 个孤儿用户。
- 不修复原因：清理涉及不可逆数据删除，按任务规约暂缓高风险数据库操作。
- 建议方案（待审批后实施）：
  1. 启动时/定时清理「无任何关联业务数据且超过 N 天未活跃」的 guest 账户（N 默认 30，`GUEST_CLEANUP_DAYS` 环境变量控制，默认关闭）；
  2. 或将 guest 创建改为 Redis 短期会话、首次产生业务数据时才落库。

## R-02 (P3) 前端工作区会话无服务端吊销

- 现状：`finos_session` 为无状态 HMAC token（7 天 TTL），登出/清洗仅清 Cookie，已泄露的 token 在过期前始终有效。
- 不修复原因：引入服务端会话存储（Redis 吊销名单）属架构变更，超出最小改动原则。
- 建议方案：在 Next.js 侧增加共享吊销缓存（Redis），`/api/account/purge` 与登出时写入会话 jti；所有 API 路由校验。

## R-03 (P3) 遗留端点面在误配置下扩大

- 现状：`ENABLE_LEGACY_MODULES=1` 时挂载约 140 个遗留端点（个人理财/自动化/多模态等）。测试套件全局开启该开关；生产误配置会重新暴露这些面。
- 建议：部署文档强化警告；考虑将开关默认值与 `ENV=production` 绑定为强制关闭。

## R-04 (Info) CSP 仍允许 unsafe-inline / unsafe-eval

- 现状：强制 CSP 已落地（本轮 V-02），但策略允许内联脚本/样式与 eval（Next.js 运行时与内联主题脚本需要）。
- 建议：后续将内联主题脚本抽为外部文件 + nonce，逐步收紧至不含 unsafe-*。

## R-05 (Info) HSTS 仅 TLS 部署启用

- 现状：HSTS 在 nginx TLS 站点配置中；HTTP-only 本地部署与 next.config/backend 均无。
- 建议：保持现状（HTTP 开发环境启用 HSTS 反而可能导致 localhost 被浏览器强制 HTTPS）。

## R-06 (Info) 限流仅按 IP 维度

- 现状：滑动窗口限流（Redis/降级进程内）仅按 IP；企业 NAT 出口下多用户共享配额。
- 建议：认证后按 user_id 追加独立配额桶（中间件需感知认证态）。

## R-07 (Info) Python 依赖无 lockfile / 11 个依赖无上界 / pytest 在生产 requirements

- 现状：requirements.txt 为范围固定；构建时传递依赖不钉扎；pytest 进入生产镜像。
- 建议：引入 pip-tools（`requirements.in` → `requirements.lock` 带 hash）；将 pytest 拆分到 `requirements-dev.txt`。

## R-08 (Info) LEGACY_ENCRYPTION_KEY 回退派生自 JWT_SECRET

- 现状：`backend/core/security.py:158` 未设置该变量时从 JWT_SECRET 派生 legacy Fernet 密钥（违反密钥分离）。
- 建议：部署时显式设置 `LEGACY_ENCRYPTION_KEY`；代码层面在 prod 缺失时告警。

## R-09 (Info) access jti 吊销缓存为进程内

- 现状：多 worker 部署下吊销不跨进程共享；影响窗口受 15 分钟 TTL 限制（refresh 已数据库级家族吊销）。
- 建议：jti 吊销迁移到 Redis（与限流共用实例）。

## R-10 (Info) 治理邀请令牌经邮件/链接明文传递

- 现状：本轮已实现「用后即从地址栏清除」（V-06），但 token 在传输链路（邮件正文、浏览器历史清除前）仍可能被截获。
- 建议：长期可改为站内通知 + 登录后一次性接受（不经过 URL token）。

## R-11 (Info) 模型 base_url 允许私网地址（显式放行时）

- 现状：`AI_ALLOW_PRIVATE_ENDPOINTS=true`（或 dev 默认）允许指向内网 Ollama 等；云元数据段始终封死。部署者显式开启即声明接受内网可达性。
- 建议：文档强化「仅在隔离网络内开启」。
