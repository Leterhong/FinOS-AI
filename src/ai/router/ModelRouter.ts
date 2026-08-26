import type { TaskType, ProviderId, ModelConfig } from "../types";
import { getAllProviders } from "../providers";

interface RoutingDecision {
  provider: ProviderId;
  model: string;
  reason: string;
}

/**
 * Routes tasks to the best model/provider based on task type.
 * Mapping is configuration-driven; extend with live latency/cost/accuracy signals as needed.
 */
class ModelRouter {
  private taskRouting: Record<TaskType, { provider: ProviderId; model: string; reason: string }> = {
    reasoning: {
      provider: "deepseek",
      model: "deepseek-reasoner",
      reason: "DeepSeek R1 optimized for step-by-step reasoning",
    },
    writing: {
      provider: "openai",
      model: "gpt-4o",
      reason: "GPT-4o best for natural language generation",
    },
    vision: {
      provider: "qwen",
      model: "qwen-vl-max",
      reason: "Qwen VL specialized for visual understanding",
    },
    "long-context": {
      provider: "claude",
      model: "claude-sonnet-4-20250514",
      reason: "Claude Sonnet offers 200K context window",
    },
    analysis: {
      provider: "openai",
      model: "gpt-4o",
      reason: "OpenAI GPT-4o strong at structured financial analysis (OPENAI_API_KEY)",
    },
    summarization: {
      provider: "openai",
      model: "gpt-4o",
      reason: "GPT-4o excellent at structured summarization",
    },
    extraction: {
      provider: "openai",
      model: "gpt-4o-mini",
      reason: "GPT-4o Mini fast and cost-effective for extraction",
    },
    planning: {
      provider: "deepseek",
      model: "deepseek-reasoner",
      reason: "DeepSeek R1 strong at task decomposition and planning",
    },
  };

  /**
   * Route a task to the optimal model.
   */
  route(taskType: TaskType, _context?: Record<string, unknown>): RoutingDecision {
    void _context;
    const route = this.taskRouting[taskType];
    return { ...route };
  }

  /**
   * Get all available models across all providers.
   */
  getAllModels(): ModelConfig[] {
    const providers = getAllProviders();
    return providers.flatMap((p) => {
      // Access models property (BaseProvider has it as public)
      const anyProvider = p as unknown as { models: ModelConfig[] };
      return anyProvider.models ?? [];
    });
  }

  /**
   * Find the best model matching required capabilities.
   */
  findModelWithCapabilities(
    capabilities: string[],
    preferredTask?: TaskType
  ): RoutingDecision | null {
    if (preferredTask) {
      return this.route(preferredTask);
    }

    // Fallback: find first provider/model with all required capabilities
    const allModels = this.getAllModels();
    for (const model of allModels) {
      if (capabilities.every((c) => model.capabilities.includes(c as ModelConfig["capabilities"][number]))) {
        return {
          provider: model.provider,
          model: model.id,
          reason: `Matches required capabilities: ${capabilities.join(", ")}`,
        };
      }
    }
    return null;
  }
}

export const modelRouter = new ModelRouter();
