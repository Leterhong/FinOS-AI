# -*- coding: utf-8 -*-
"""Phase 7.4 — AI Autonomous Engine（智能自动化 + AI 主动服务系统）。

子模块：
  scheduler/  定时调度（每日/每周/每月/单次）
  trigger/    事件驱动触发器（条件 DSL + 冷却）
  workflow/   if/then 工作流引擎
  planner/    长期运行计划（Agent 周期巡检）
  executor/   动作执行器（通知/报告/Agent/Webhook/行动项）
  market/     真实金融数据接口层（Provider 模式 + 缓存降级）
  agents/     Investment / Cashflow / Preference 智能体

注意：为规避循环导入，本文件不导入 router，请使用
      `from backend.autonomous.router import router`。
"""
