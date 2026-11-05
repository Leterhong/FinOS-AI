# FinOS AI — 安全漏洞清单及风险评级（V1）

- 审计对象：`f61b6dc`（origin/main，BYOM 版）
- 日期：2026-11-06
- 状态标注：✅ 已验证（动态/静态证据齐全）｜⚠️ 待验证｜🚫 已排除误报

## 汇总

| 等级 | 确认 | 已修复 | 接受风险/待办 |
| --- | --- | --- | --- |
| P0 严重 | 0 | — | — |
| P1 高危 | 0 | — | — |
| P2 中危 | 2 | 2 | 1 项修复建议暂缓（需审批的数据库清理） |
| P3 低危 | 6 | 5 | 1 项设计权衡（会话无服务端吊销） |
| Info | 7 | 2 | 5 接受/建议 |

---

## V-01 (P2) 容器启动日志泄露数据库密码

- 类型：敏感信息泄露（CWE-532）
- 文件：`deploy/scripts/entrypoint.sh:10`
- 成因：启动时原样 echo `DATABASE_URL`，compose 环境下该值含 PostgreSQL 密码，进入容器日志与日志聚合系统。
- 攻击前提：能读取容器日志（运维平台泄露、日志外发配置错误）。
- 影响：数据库凭据泄露 → 数据库完全失陷。
- 验证：静态确认（echo 语句原文输出未脱敏变量）。
- 修复：日志中仅输出数据库类型与主机，屏蔽用户名/密码。
- 状态：✅ 已验证 → 已修复

## V-02 (P2) 前端 CSP 仅 Report-Only

- 类型：安全头缺失（CWE-693）
- 文件：`next.config.ts:41`
- 成因：CSP 以 `Content-Security-Policy-Report-Only` 下发，对实际注入无拦截力。
- 攻击前提：存在 XSS 注入点时（当前未发现可利用注入点，Markdown 渲染器为安全实现）。
- 影响：失去纵深防御层。
- 验证：静态确认（header 名为 Report-Only）。
- 修复：改为强制 `Content-Security-Policy`（策略本身已允许 `unsafe-inline`/`unsafe-eval`，应用内唯一内联脚本为主题探测，不受影响）。
- 状态：✅ 已验证 → 已修复

## V-03 (P2) 自定义技能剧本未包裹注入系统提示

- 类型：存储型提示注入（CWE-1427）
- 文件：`src/app/api/enterprise/ai/route.ts:159,228`
- 成因：用户导入技能的 `playbook` 原样拼接进 system prompt。导入时的风险扫描为咨询性（用户可"坚持导入"），恶意剧本可覆盖系统指令（如"忽略风险、结论无风险"）。
- 攻击前提：攻击者诱导用户导入恶意技能文件（技能当前为按用户隔离，跨用户需社工）。
- 影响：AI 研判结论被操纵，误导风控判断。
- 验证：静态确认（拼接点无不可信内容包裹）。
- 修复：playbook 以明确的"不可信内容"定界符包裹，并追加防覆盖指令。
- 状态：✅ 已验证 → 已修复

## V-04 (P3) 仓库跟踪调试残留文件

- 文件：`tmp-route-head.txt`（根目录）
- 修复：删除。
- 状态：✅ 已验证 → 已修复

## V-05 (P3) 遗留端点无认证

- 文件：`backend/intelligence/router.py:163` `GET /api/intelligence/events`
- 成因：唯一无 Bearer 依赖的业务端点（静态人生事件目录，遗留门控内）。
- 影响：信息暴露极有限（静态目录），但破坏"所有业务端点需认证"的统一边界。
- 修复：补 `Depends(get_current_user)`。
- 状态：✅ 已验证 → 已修复

## V-06 (P3) 治理邀请令牌滞留 URL

- 文件：`src/app/(dashboard)/governance/page.tsx:108-123`
- 成因：`?invite=&token=` 接受邀请后不从地址栏清除，token 残留在浏览器历史/引用页。
- 修复：自动接受完成后 `history.replaceState` 清除查询参数。
- 状态：✅ 已验证 → 已修复

## V-07 (P3) 模型草稿测试 DNS 重绑定窗口

- 文件：`src/ai/model-center/tester/index.ts`（`assertSafeBaseUrl` 校验后 `provider.generate` 再次 DNS 解析）
- 成因：校验与请求之间存在解析 TOCTOU 窗口；攻击者可先解析公网 IP 通过校验、请求时解析到内网/元数据地址。后端网关已用 IP 钉扎修复同类问题，前端草稿测试未覆盖。
- 限制因素：需要工作区会话；错误响应仅状态码（无响应体回显）；元数据响应非 OpenAI JSON，内容不回显。
- 修复：在发起请求前对同一次解析结果复检（缩小窗口至毫秒级），残余风险记录在案。
- 状态：✅ 已验证 → 已修复（窗口收缩，残余见 REMAINING_RISKS）

## V-08 (Info) CI 工作流缺少 permissions 块

- 文件：`.github/workflows/ci.yml`
- 修复：为全部 job 添加 `permissions: contents: read` 最小权限。
- 状态：✅ 已修复

## 已核验为安全的项（🚫 排除误报）

| 检查项 | 结论 |
| --- | --- |
| 账户删除表覆盖 | 元数据驱动（遍历含 user_id 的表）+ 组织级清理，覆盖全部新表（security/router.py:141-186）✅ |
| 企业 upsert 批量赋值 | user_id 服务端注入；organizationId 创建时校验成员资格（enterprise/router.py:457-462）✅ |
| CSRF | 浏览器发起的变更请求必带 Origin，白名单强制（middleware.py:63-66）；双提交缺失时由 Origin+SameSite 兜底，设计成立 |
| SQL 注入 | 唯一 f-string SQL 的表名来自 DB inspector，非用户输入 ✅ |
| XSS | Markdown 渲染器仅生成 React 元素；无 dangerouslySetInnerHTML 用户输入；AI 输出按纯文本/安全渲染 ✅ |
| IDOR | Next 模型路由按会话 userId 隔离；后端 require_owned_resource/组织门控全覆盖 ✅ |
| 文件上传 | 扩展名白名单 + 大小上限 + UUID 文件名 + AES 落盘 + 路径包含检查 ✅ |
| 密钥泄露 | git 无真实密钥；密钥掩码返回；生产 fail-fast 守卫 ✅ |
| npm audit | 0 已知漏洞（next 15.5.21 为已修补线）✅ |
| 备份导出 | export 用户级隔离 + CSV 公式注入防护；database 双门控默认关闭 ✅ |

## 记录为接受风险 / 暂缓项（见 SECURITY_REMAINING_RISKS.md）

| 编号 | 等级 | 事项 | 不修复原因 |
| --- | --- | --- | --- |
| R-01 | P2 | bootstrap 无认证建 guest 用户行（60/min/IP），长期膨胀 | 清理属不可逆数据删除，按规约暂缓；提出带白名单的清理方案待审批 |
| R-02 | P3 | 前端工作区会话无服务端吊销（7 天 TTL） | 无状态 HMAC 设计；加吊销需引入服务端会话存储，属架构变更 |
| R-03 | Info | 注册接口邮箱枚举（409） | 自托管产品 UX 权衡，业界常见 |
| R-04 | Info | 11 个 Python 依赖无上界、无 pip lockfile、pytest 进生产镜像 | 加上界有破坏构建风险，建议引入 pip-tools 单独执行 |
| R-05 | Info | CSP 仍允许 unsafe-inline/unsafe-eval | 当前内联主题脚本需要；迁移外部脚本后可收紧 |
| R-06 | Info | HSTS 仅 TLS 部署启用 | HTTP 纯本地部署无 TLS 终结点 |
| R-07 | Info | 限流仅按 IP 维度 | 按用户限流需中间件感知认证态，属功能增强 |
| R-08 | Info | LEGACY_ENCRYPTION_KEY 未设置时回退派生自 JWT_SECRET | 建议部署时显式设置；改动影响历史密文解密 |
| R-09 | Info | access jti 吊销缓存为进程内（多 worker 不共享） | access token 15 分钟 TTL 限制影响窗口 |
