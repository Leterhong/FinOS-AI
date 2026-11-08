## 变更描述

<!-- 清晰简洁地描述本次 PR 做了什么，以及为什么 -->

## 变更类型

- [ ] Bug 修复
- [ ] 新功能
- [ ] 安全加固
- [ ] 文档更新
- [ ] 重构 / 性能优化
- [ ] 其他

## 自检清单

- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过（前端契约 28 项）
- [ ] `npm run test:unit` 通过（纯函数单测）
- [ ] `npm run build` 通过（Next.js 生产构建）
- [ ] `npm run test:backend` 通过（后端 pytest + ruff）
- [ ] e2e 通过（`node tests/e2e/main-chain.mjs`，需先 build）
- [ ] 未提交真实企业数据、API Key、数据库或任何密钥
- [ ] 未引入 `dangerouslySetInnerHTML`、硬编码色值或预置示例数据
- [ ] 新端点有认证；新用户输入有校验
- [ ] 涉及金融判断的功能保留了证据引用和人工复核边界
