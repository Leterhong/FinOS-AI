"use client";

/**
 * AI Processing State（三档：compact / normal / detailed）。
 *
 * 阶段数据必须来自真实管线事件（如文档分析的 SSE stage 流），
 * 禁止用假进度或定时器伪装执行状态。
 */
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProcessingStageState = "pending" | "active" | "done";

export interface ProcessingStage {
  id: string;
  label: string;
  state: ProcessingStageState;
}

export function AIProcessingState({
  title,
  stages,
  elapsedSeconds,
  mode = "normal",
  className,
}: {
  title?: string;
  stages: ProcessingStage[];
  elapsedSeconds?: number;
  /** compact：单行文本；normal：垂直清单；detailed：清单 + 计时 + 标题。 */
  mode?: "compact" | "normal" | "detailed";
  className?: string;
}) {
  if (mode === "compact") {
    const active = stages.find((stage) => stage.state === "active");
    return (
      <span className={cn("inline-flex items-center gap-2 text-xs text-slate-400", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-intel" />
        {active ? active.label : title || "AI 处理中"}
      </span>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {(title || elapsedSeconds != null) && (
        <p className="flex items-center gap-2 font-medium text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-intel" />
          {title}
          {elapsedSeconds != null && elapsedSeconds > 0 && (
            <span className="text-[10px] font-normal text-slate-600">已执行 {elapsedSeconds} 秒</span>
          )}
        </p>
      )}
      <ul className={cn("space-y-1.5", mode === "detailed" && "space-y-2")}>
        {stages.map((stage) => (
          <li key={stage.id} className="flex items-center gap-2">
            {stage.state === "done" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : stage.state === "active" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-intel" />
            ) : (
              <span className="h-3.5 w-3.5 rounded-full border border-white/15" />
            )}
            <span
              className={cn(
                stage.state === "done" && "text-slate-400",
                stage.state === "active" && "text-intel",
                stage.state === "pending" && "text-slate-700"
              )}
            >
              {stage.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
