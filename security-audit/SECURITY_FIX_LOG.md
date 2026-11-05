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

## 修复效果验证方式

- 全部门禁：typecheck ✓、contract 28/28 ✓（新增 4 条安全回归）、unit 79/79 ✓、build ✓、pytest 全绿 ✓、ruff ✓、e2e 18/18 ✓
- V-01/V-06 为运行时行为（shell 日志、浏览器 history），以人工核验 + 代码评审确认
