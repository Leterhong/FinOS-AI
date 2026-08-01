"""Wealth Intelligence Engine（Phase 7.1）。

把 FinOS AI 从「财富数据分析工具」升级为「具备预测、规划、模拟能力的 AI 财富顾问」。

六大子域：
- prediction    财富预测引擎（1/5/10 年资产、现金流、退休资金、目标达成概率、Wealth Timeline）
- simulation    人生事件模拟器（买房/换工作/创业/结婚/生育/退休/留学）+ 方案 A/B/C 对比
- scoring       六维财富健康评分（资产/现金流/风险/目标/投资/保障）
- recommendation 财富策略生成器（短期/中期/长期）
- reasoning     AI 解释层（强制「原因 / 影响 / 建议」三段式）
- planner       多 Agent 协作工作流（Planner → 并行子 Agent → Strategy → Summary）
- ltm           长期记忆 2.0（偏好 / 人生阶段 / 历史决策 / 财富变化）

硬性约束（贯穿全模块）：
1. 数据真实性：所有结论必须来自用户真实输入 + 明确的模型假设，绝不编造数字；
   无数据一律返回 hasData=False + 欢迎文案。
2. 成本控制：预测/模拟/评分为纯代码计算（零 LLM）；仅「解释 / 策略叙述」在
   已配置模型且场景复杂时才调用 LLM，失败静默降级本地模板。
3. 风险提示：所有对外结果强制带 DISCLAIMER，禁止承诺收益、禁止自动交易。
"""

from backend.intelligence.constants import DISCLAIMER, WELCOME_MESSAGE

__all__ = ["DISCLAIMER", "WELCOME_MESSAGE"]
