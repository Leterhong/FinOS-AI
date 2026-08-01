// AI Infrastructure — single entry point for all AI capabilities.
// All pages, agents, and components MUST import from here for AI operations.

export { aiService } from "./gateway/AIService";
export { modelRouter } from "./router/ModelRouter";
export { contextBuilder } from "./context/ContextBuilder";
export { goalRecognizer } from "./services/GoalRecognizer";
export { planner } from "./services/Planner";
export { workflowEngine } from "./services/WorkflowEngine";
export { getPrompt, getAllPrompts } from "./prompts";
export { getProvider, getAllProviders, getDefaultProvider } from "./providers";

export type {
  GoalType,
  RecognizedGoal,
  AITask,
  TaskStatus,
  TaskType,
  WorkflowState,
  WorkflowPhase,
  AgentAnalysisOutput,
  FinancialContextData,
  AIMessage,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  TokenUsage,
  Provider,
  ProviderId,
  ModelConfig,
} from "./types";
