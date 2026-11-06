# FinOS AI — 漏洞修复记录（V1）

- 修复基线：`f61b6dc`（origin/main，BYOM 版）
- 修复日期：2026-11-06
- 原则：最小改动；每项修复附带回归测试；无业务功能删减；无数据库破坏性操作

| 编号 | 修改文件 | 修改内容 | 影响原有业务 | 回归测试 |
| --- | --- | --- | --- | --- |
| V-01 | `deploy/scripts/entrypoint.sh:10-15` | 启动日志改为 `sed` 脱敏输出（`://***:***@`），不再打印含密码的 DATABASE_URL | 无（仅日志格式变化） | 人工核验脚本语法；无自动化（shell 启动脚本） |
| V-02 | `next.config.ts:41` | `Content-Security-Policy-Report-Only` → 强制 `Content-Security-Policy`；注释同步更新 | 低：策略本身允许 `unsafe-inline`/`unsafe-eval`，应用内唯一内联主题脚本不受影响；已通过 build + 全页面 200 验证 | 契约测试 `Next 页面响应必须声明强制 CSP`（原 Report-Only 断言已按新契约更新）|
| V-03 | `src/app/api/enterprise/ai/route.ts:159-161` | skill.playbook 以「不可信参考材料」定界符包裹后再拼接 system prompt | 无（AI 收到等价信息，仅增加防注入边界声明） | 契约测试 `V-03 回归` |
| V-04 | 删除 `tmp-route-head.txt` | 移除入库的调试残留 | 无 | 契约测试 `V-04 回归` |
| V-05 | `backend/intelligence/router.py:164` | `GET /intelligence/events` 增加 `Depends(get_current_user)` | 极低：静态目录端点（遗留门控内）；前端无调用方 | pytest `test_intelligence_events_requires_auth`（无 token 401 / 有 token 200）|
| V-06 | `src/app/(dashboard)/governance/page.tsx:114-117` | 邀请自动接受后 `history.replaceState` 清除 `?invite=&token=` | 无 | 人工核验（浏览器 history 行为）|
| V-07 | `src/ai/model-center/providers/OpenAICompatibleProvider.ts` | 新增 `ensureSafeEndpoint()`，`generate/stream/embed` 三个出站入口调用时复检 `assertSafeBaseUrl`；`tester` 原有校验保留 | 低：合法公网端点校验通过不受影响；playground/企业 AI/文档管线首次获得调用时校验 | 契约测试 `V-07 回归`（三入口断言）|
| V-08 | `.github/workflows/ci.yml` | 顶层 `permissions: contents: read` 最小权限 | 无 | CI 运行验证 |

## 追加：R-01 缓解（审计报告发布同日）

| 编号 | 修改文件 | 修改内容 | 影响原有业务 | 回归测试 |
| --- | --- | --- | --- | --- |
| R-01 缓解 | `backend/security/guest_cleanup.py`（新增）、`backend/main.py`（lifespan 调用）、`backend/config/settings.py`（`GUEST_CLEANUP_DAYS`，默认 0）、`.env.example` | 启动期清理「超龄 + 零业务数据 + 无活跃会话」的 guest 账户；默认关闭，显式设置才生效；元数据驱动业务表扫描 | 无（默认关闭；开启后仅影响空访客账户，注册用户与有数据访客绝不触碰） | pytest `test_guest_cleanup_removes_empty_old_guest_only`（多边界断言）|

## 追加：R-02/R-03/R-07/R-08 缓解（审计后续批次）

| 编号 | 修改文件 | 修改内容 | 影响原有业务 | 回归测试 |
| --- | --- | --- | --- | --- |
| R-02 | `src/auth/revocation.ts`（新增）、`src/auth/session.ts`（getSessionUserId 校验）、`src/app/api/account/purge/route.ts`、`src/app/api/workspace/session/route.ts` | 按 userId 吊销时间戳；purge/reset 触发吊销；iat 早于时间戳的会话拒绝 | 低：登出/清洗后原 token 失效属预期行为；正常登录流 iat 晚于任何吊销时间戳不受影响 | 全部门禁 + e2e 18/18（登录/清洗/重建流覆盖） |
| R-03 | `backend/main.py` | 非 debug 环境 ENABLE_LEGACY_MODULES=1 时输出显式 warning | 无（仅日志） | ruff + pytest 套件（conftest 开启 legacy 时验证不影响启动） |
| R-07 | `backend/requirements-dev.txt`（新增）、`backend/requirements.txt`（移除 pytest）、`.github/workflows/ci.yml`（backend job 改装 dev 依赖） | 生产镜像/依赖不再携带 pytest | 无（生产代码无 pytest 导入） | CI backend job 正常运行 pytest |
| R-08 | `backend/core/security.py:_legacy_fernet` | 未设置 LEGACY_ENCRYPTION_KEY 时输出显式 warning（密钥分离违规提示） | 无（回退行为保留，历史密文兼容） | pytest 加解密套件 |

## 追加：PT-19 修复（动态渗透测试发现）

| 编号 | 修改文件 | 修改内容 | 影响原有业务 | 回归测试 |
| --- | --- | --- | --- | --- |
| PT-19(P2) | `backend/main.py:111` | `/docs` `/redoc` `/openapi.json` 暴露条件从 `debug or sqlite` 收紧为 `debug`（显式 DEBUG=true） | 低：本地开发者需设 DEBUG=true 才能查看 Swagger（原来 SQLite 模式自动暴露全量 API 文档给未认证访问者） | pytest 全绿（conftest 用 SQLite 但 ENV=test 不触发 debug；需显式 DEBUG=true 才开 docs）；全页面 200 |

## 修复效果验证方式## 修复效果验证方式

- 全部门禁：typecheck ✓、contract 28/28 ✓（新增 4 条安全回归）、unit 79/79 ✓、build ✓、pytest 全绿 ✓、ruff ✓、e2e 18/18 ✓
- V-01/V-06 为运行时行为（shell 日志、浏览器 history），以人工核验 + 代码评审确认
