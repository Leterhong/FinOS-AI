"use client";

import { AlertTriangle, Info, AlertCircle } from "lucide-react";
import type { AdvisorAlert } from "@/twin/advisor";

const levelStyle: Record<
  AdvisorAlert["level"],
  { ring: string; text: string; Icon: typeof Info }
> = {
  critical: { ring: "ring-red-500/30", text: "text-red-300", Icon: AlertCircle },
  warn: { ring: "ring-amber-500/30", text: "text-amber-300", Icon: AlertTriangle },
  info: { ring: "ring-brand-electric/30", text: "text-brand-electric", Icon: Info },
};

/** AI 主动建议面板（Advisor Scheduler 输出）。 */
export default function AdvisorPanel({ alerts }: { alerts: AdvisorAlert[] }) {
  if (!alerts?.length) {
    return (
      <div className="rounded-xl bg-white/[0.03] p-4 text-sm text-white/40 ring-1 ring-white/10">
        暂无主动提醒，你的财富状况良好。
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const s = levelStyle[a.level];
        const Icon = s.Icon;
        return (
          <div
            key={a.id}
            className={`flex items-start gap-2.5 rounded-xl bg-white/[0.03] p-3 ring-1 ${s.ring}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.text}`} />
            <div>
              <div className={`text-sm font-medium ${s.text}`}>{a.title}</div>
              <div className="text-xs text-white/50">{a.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
