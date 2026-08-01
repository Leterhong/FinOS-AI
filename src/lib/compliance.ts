/**
 * 合规声明常量（Phase 6.4 第十二项）—— 客户端 / 服务端共享（无 server-only 依赖）。
 * 服务端 Agent 层的同名声明位于 src/agents/base.ts（server-only），文案保持一致。
 */

/** 金融分析统一免责声明（UI 页脚 / 报告尾部） */
export const FINANCIAL_DISCLAIMER_TEXT =
  "以上内容为基于用户数据与金融知识库的分析意见与教育信息，不构成投资建议，不保证任何收益。市场有风险，决策需谨慎。";

/** 数据来源统一声明（投资分析场景） */
export const ANALYSIS_BASIS_NOTE =
  "以上分析基于用户提供的数据和市场信息，仅用于辅助决策。";
