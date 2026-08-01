import { BaseAgent } from "./base";
import { getPrompt } from "../ai/prompts";
import type { TaskType } from "../ai/types";

/**
 * CashFlow Agent — analyzes income, expenses, savings rate, emergency fund and
 * cash-flow stability from the financial context. Routes via ModelRouter as "analysis".
 */
export class CashFlowAgent extends BaseAgent {
  id = "cashflow";
  name = "现金流分析 Agent";
  description = "分析收入、支出、储蓄率、应急资金与现金流稳定性";
  systemPrompt = getPrompt("cashflow");
  taskType: TaskType = "analysis";
}
