"use client";

import Link from "next/link";
import GlassCard from "../ui/GlassCard";
import GlowDot from "../ui/GlowDot";
import { Cpu, Zap, AlertTriangle, ArrowRight } from "lucide-react";
import { useModelStore } from "@/store/model-store";
import type { ProviderType } from "@/ai/model-center/types";

/** 客户端安全的 Provider 展示名（presets.ts 为 server-only，不可在此引用）。 */
const PROVIDER_LABEL: Record<ProviderType, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  claude: "Claude",
  gemini: "Gemini",
  zhipu: "智谱 GLM",
  moonshot: "Kimi",
  ollama: "Ollama",
  custom: "自定义",
};

const STATUS_META: Record<
  string,
  { label: string; dot: "success" | "warn" | "risk"; text: string }
> = {
  online: { label: "在线", dot: "success", text: "text-semantic-success" },
  offline: { label: "离线", dot: "risk", text: "text-semantic-risk" },
  error: { label: "异常", dot: "risk", text: "text-semantic-risk" },
  untested: { label: "未测试", dot: "warn", text: "text-semantic-warn" },
};

export default function BentoAiBrain({ delay = 0 }: { delay?: number }) {
  const active = useModelStore((s) => s.active);
  const health = useModelStore((s) => s.health);
  const configured = active?.configured ?? false;
  const status = active?.status ?? "offline";
  const meta = STATUS_META[status] ?? STATUS_META.offline;

  // 平均响应时间（健康汇总中有效延迟的样本均值）
  const validLatencies = health
    .map((h) => h.latencyMs)
    .filter((l): l is number => typeof l === "number" && l > 0);
  const avgLatency =
    validLatencies.length > 0
      ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
      : active?.latencyMs;

  return (
    <GlassCard className="p-6" delay={delay}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-white/40">AI 大脑状态</p>
        <div className="flex items-center gap-1.5">
          <GlowDot color={configured ? meta.dot : "warn"} size="sm" />
          <span className="text-[11px] text-white/40">
            {configured ? `${active?.totalModels ?? 0} 个模型` : "未连接"}
          </span>
        </div>
      </div>

      {active?.configured ? (
        <div className="mt-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-purple">
              <Cpu className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {active.modelName}
              </p>
              <p className="text-[11px] text-white/40">
                {active.displayName} · {active.providerType ? PROVIDER_LABEL[active.providerType] : ""}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/[0.04] p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-white/30">运行状态</p>
              <p className={`text-xs font-medium ${meta.text}`}>{meta.label}</p>
            </div>
            <div className="rounded-lg bg-white/[0.04] p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-white/30">响应时间</p>
              <p className="flex items-center gap-1 text-xs font-medium text-white/80">
                <Zap className="h-3 w-3 text-brand-electric" />
                {avgLatency ? `${avgLatency} ms` : "—"}
              </p>
            </div>
          </div>

          <Link
            href="/settings/models"
            className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-white/8 bg-white/[0.03] py-2 text-[11px] text-white/50 transition hover:border-brand-electric/30 hover:text-white/80"
          >
            管理模型
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-start gap-2.5 rounded-xl bg-semantic-warn/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-semantic-warn" />
            <div>
              <p className="text-xs font-medium text-semantic-warn">尚未连接任何 AI 模型</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">
                FinOS AI 不提供内置模型，请接入您自己的模型 API 后开始使用。
              </p>
            </div>
          </div>
          <Link
            href="/settings/models"
            className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-gradient-brand py-2 text-[11px] font-medium text-white shadow-glow-blue transition hover:opacity-90"
          >
            去连接模型
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </GlassCard>
  );
}
