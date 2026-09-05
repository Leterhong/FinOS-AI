"use client";

/**
 * AI Execution Timeline（2.2 第二十七节）。
 *
 * 展示一次 Agent 运行的阶段轨迹与真实用量（时长 / 模型 / 产出摘要）。
 * 阶段数据必须来自运行记录；没有分阶段数据时以单节点呈现最终状态。
 */
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExecutionStage {
  label: string;
  state: "done" | "active" | "failed" | "pending";
  detail?: string;
}

export function AIExecutionTimeline({
  stages,
  className,
}: {
  stages: ExecutionStage[];
  className?: string;
}) {
  return (
    <ol className={cn("space-y-0", className)}>
      {stages.map((stage, index) => (
        <li key={`${stage.label}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
          {index < stages.length - 1 && <span className="absolute left-[7px] top-5 h-full w-px bg-white/[0.09]" aria-hidden />}
          <span className="relative z-10 mt-0.5 shrink-0">
            {stage.state === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : stage.state === "active" ? (
              <Loader2 className="h-4 w-4 animate-spin text-intel" />
            ) : stage.state === "failed" ? (
              <XCircle className="h-4 w-4 text-rose-400" />
            ) : (
              <Circle className="h-4 w-4 text-slate-700" />
            )}
          </span>
          <div className="min-w-0">
            <p className={cn(
              "text-xs font-medium",
              stage.state === "done" && "text-slate-300",
              stage.state === "active" && "text-intel",
              stage.state === "failed" && "text-rose-300",
              stage.state === "pending" && "text-slate-700"
            )}>
              {stage.label}
            </p>
            {stage.detail && <p className="mt-0.5 break-words text-[10px] leading-5 text-slate-600">{stage.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
