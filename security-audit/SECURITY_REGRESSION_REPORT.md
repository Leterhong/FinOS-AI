# FinOS AI — 安全回归测试报告（V1）

- 日期：2026-11-06
- 修复基线：`f61b6dc` + 本轮安全修复（未提交时点）
- 结论：**原有功能全部通过；新增安全校验全部通过；无回归失败。**

## 1. 自动化门禁结果

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| TypeScript strict | `npm run typecheck` | 0 错误 |
| 前端契约测试 | `npm test` | **28/28 通过**（含 4 条新增安全回归 + 1 条按新 CSP 契约更新） |
| 纯函数单测 | `npm run test:unit` | **79/79 通过** |
| 后端回归 | `npm run test:backend`（pytest，含 legacy 模块） | **全绿**（含新增 `test_intelligence_events_requires_auth`） |
| Lint | `ruff check backend` | All checks passed |
| 生产构建 | `npm run build` | ✓ Compiled successfully |
| 端到端主链路 | `node tests/e2e/main-chain.mjs`（mock LLM，真实双服务） | **18/18 通过** |
| 依赖扫描 | `npm audit` | 0 已知漏洞 |

## 2. 新增安全回归用例（防回归锚点）

| 用例 | 防护的漏洞 | 位置 |
| --- | --- | --- |
| `test_intelligence_events_requires_auth` | V-05 遗留端点无认证 | `tests/backend/test_security.py` |
| `V-02 回归：前端 CSP 必须为强制执行` | V-02 CSP Report-Only | `tests/frontend/contract.test.mjs` |
| `V-03 回归：技能剧本必须以不可信内容定界符包裹` | V-03 存储型提示注入 | 同上 |
| `V-04 回归：调试残留文件不得入库` | V-04 调试残留 | 同上 |
| `V-07 回归：Provider 出站前必须复检 baseUrl` | V-07 SSRF TOCTOU | 同上 |
| 原 CSP 契约更新 | 与 V-02 新契约一致（强制 CSP） | 同上 |

## 3. 原有功能回归（按任务书 7.1 逐项）

| 功能 | 验证方式 | 结果 |
| --- | --- | --- |
| 注册/登录/退出/刷新 | pytest auth 套件（轮换、重放、家族吊销、并发 409） | ✓ |
| 用户信息/头像 | pytest user 套件 | ✓ |
| 模型配置 CRUD + 掩码 + 加密 | pytest ai 套件 + e2e | ✓ |
| 企业对象 CRUD + 快照 | pytest enterprise 套件 + e2e B 段（含跨用户隔离） | ✓ |
| 治理（成员/授权/密级/复核/规则历史/评测/连接器） | pytest governance 套件 + e2e C 段 | ✓ |
| 资料分析管线（CSV/PDF/图片 OCR） | e2e A7（结构化事实 + 引用） | ✓ |
| 规则引擎确定性命中 | e2e A8 + unit rule-engine 79 项 | ✓ |
| SSE 流式输出 | e2e A5/A6 | ✓ |
| 文件上传/下载/删除 | pytest document 套件 | ✓ |
| 页面路由（13 页） | 全部 200（本地 dev 实测） | ✓ |
| 数据库读写/迁移 | ci.yml alembic smoke + pytest 隔离库 | ✓ |
| 备份导出/账户删除 | pytest backup/security 套件 | ✓ |

## 4. 安全回归（按任务书 7.2 逐项）

| 场景 | 验证 | 结果 |
| --- | --- | --- |
| 未登录访问受保护接口 | pytest 多套件 + 新增 V-05 用例 | ✓ 401/404 |
| 跨用户数据访问（IDOR） | test_enterprise `test_cross_user_*` / `test_isolation` 套件 | ✓ 统一 404 |
| 普通用户越权治理操作 | test_governance 权限矩阵（密级/角色/授权） | ✓ |
| 参数异常/非法文件 | test_upload_rejects_dangerous_extension 等 | ✓ |
| 密钥不泄露 | test_no_plaintext_key_in_any_response / health 探针用例 | ✓ |
| Token 失效/重放 | test_auth 轮换+重放家族吊销 | ✓ |
| 提示注入 | unit prompt-guard + 评测套件 | ✓（V-03 增加定界符后边界更明确） |
| CSP | 新增强制 CSP 契约 | ✓ |

## 5. 未覆盖声明

- 未执行破坏性动态渗透（生产环境禁用；本地为授权测试环境）
- 并发竞态仅覆盖 refresh 轮换（pytest），未做全接口并发压测
- Python 依赖无 lockfile，未做 CVE 数据库全量比对（npm audit 为 0）
- 遗留 140 端点为清单级走查 + 抽样，未逐端点深度审计
