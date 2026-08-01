"""Phase 7.2 Agent 插件生态。

    base.py     Agent 基类与统一结果结构
    registry.py 动态注册表 + 用户级开关（Agent Marketplace）
    tools.py    Tool 系统（calc / db / rag / market / file）
    context.py  AI 上下文管理器（一次加载，全流程复用）
    workflow.py 串行 / 并行 / 条件 任务编排
    plugins/    内置 Agent：cashflow / investment / retirement / insurance / tax

对外：backend.agents.api.router（FastAPI 路由，prefix=/agents）
"""
