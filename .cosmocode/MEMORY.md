# 用户指令记忆

本文件记录了用户的指令、偏好和教导，用于在未来的交互中提供参考。

## 格式

### 用户指令条目
用户指令条目应遵循以下格式：

[用户指令摘要]
- Date: [YYYY-MM-DD]
- Context: [提及的场景或时间]
- Instructions:
  - [用户教导或指示的内容，逐行描述]

### 项目知识条目
Agent 在任务执行过程中发现的条目应遵循以下格式：

[项目知识摘要]
- Date: [YYYY-MM-DD]
- Context: Agent 在执行 [具体任务描述] 时发现
- Category: [运维部署|构建方法|测试方法|排错调试|工作流协作|环境配置]
- Instructions:
  - [具体的知识点，逐行描述]

## 去重策略
- 添加新条目前，检查是否存在相似或相同的指令
- 若发现重复，跳过新条目或与已有条目合并
- 合并时，更新上下文或日期信息
- 这有助于避免冗余条目，保持记忆文件整洁

## 条目

[生产启动与限流配置]
- Date: 2026-10-04
- Context: Agent 在执行文档与截图批次任务、需要重启服务时发现
- Category: 运维部署
- Instructions:
  - 生产模式预览通过仓库根目录 `./start.sh` 启动（Web 3000 / API 8300），停止使用 `./stop.sh`。
  - 修改前端或后端代码后，需先 `./stop.sh` 再 `./start.sh` 才会生效，服务就绪约 120 秒，需等待后再访问。
  - 限流配置的后端字段名为 `api_in_in` / `auth_in_in` / `ai_in_in`（见 `backend/config/settings.py`），可通过环境变量在启动时覆盖，例如 `AUTH_IN_IN=9000 API_IN_IN=20000 AI_IN_IN=2000 ./start.sh`；`.env.example` 中的 `API_RATE_LIMIT_PER_MINUTE` / `AI_RATE_LIMIT_PER_MINUTE` 与后端字段名不同。
