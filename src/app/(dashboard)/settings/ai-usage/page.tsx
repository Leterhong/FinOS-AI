"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GlassCard from "@/components/ui/GlassCard";
import { useAuthStore } from "@/store/auth-store";
import type { UsageSummary } from "@/ai/usage/usage-tracker";
import type { AIQuota } from "@/ai/orchestration/types";

interface UsagePayload {
  usage: UsageSummary;
  quota: AIQuota;
}

function fmtInt(n: number): string {
  return n.toLocaleString("zh-CN");
}
function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}
function fmtTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN");
}

export default function AIUsagePage() {
  const status = useAuthStore((s) => s.status);
  const [data, setData] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dailyCalls, setDailyCalls] = useState("50");
  const [monthlyTokens, setMonthlyTokens] = useState("2000000");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/usage`);
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; usage: UsageSummary; quota: AIQuota };
        setData({ usage: json.usage, quota: json.quota });
        setDailyCalls(String(json.quota.dailyCalls));
        setMonthlyTokens(String(json.quota.monthlyTokens));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "guest") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const saveQuota = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ai/usage/limit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyCalls: Number(dailyCalls),
          monthlyTokens: Number(monthlyTokens),
        }),
      });
      if (res.ok) {
        setSavedAt(Date.now());
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">AI 用量中心</h1>
        <p className="text-sm text-white/50">加载中…</p>
      </div>
    );
  }

  const { usage, quota } = data;
  const agentEntries = Object.entries(usage.byAgent).sort((a, b) => b[1].tokens - a[1].tokens);

  // 额度使用进度
  const tokenPct = quota.monthlyTokens > 0 ? Math.min(100, (usage.monthTokens / quota.monthlyTokens) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI 用量中心</h1>
          <p className="mt-1 text-sm text-white/50">
            所有 AI 调用经服务端代理执行；简单计算（净资产 / 储蓄率等）不消耗 Token。
          </p>
        </div>
        <Link
          href="/settings/profile"
          className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/5"
        >
          返回设置
        </Link>
      </div>

      {/* 本月概览 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <GlassCard className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/40">本月调用次数</p>
          <p className="mt-1 text-2xl font-bold text-white">{fmtInt(usage.monthCalls)}</p>
          <p className="mt-0.5 text-[11px] text-white/40">累计 {fmtInt(usage.totalCalls)} 次</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/40">本月 Token</p>
          <p className="mt-1 text-2xl font-bold text-white">{fmtInt(usage.monthTokens)}</p>
          <p className="mt-0.5 text-[11px] text-white/40">累计 {fmtInt(usage.totalTokens)}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/40">本月估算费用</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{fmtMoney(usage.monthCostUsd)}</p>
          <p className="mt-0.5 text-[11px] text-white/40">累计 {fmtMoney(usage.totalCostUsd)}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/40">最近调用</p>
          <p className="mt-1 text-sm font-medium text-white">{fmtTime(usage.lastCallAt)}</p>
        </GlassCard>
      </div>

      {/* 额度使用进度 */}
      <GlassCard className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white/70">本月 Token 额度使用</h3>
          <span className="text-xs text-white/50">
            {fmtInt(usage.monthTokens)} / {fmtInt(quota.monthlyTokens)}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-brand-electric"
            style={{ width: `${tokenPct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-white/40">
          达到上限后将降级返回最近一次分析结果，并提示「今日 / 本月 AI 分析额度已达到限制」。
        </p>
      </GlassCard>

      {/* 各 Agent 明细 */}
      <GlassCard className="p-6">
        <h3 className="mb-4 text-sm font-medium text-white/70">各智能体用量明细</h3>
        {agentEntries.length === 0 ? (
          <p className="text-sm text-white/40">暂无调用记录。打开 Dashboard 不会消耗 Token；仅在你主动分析或提问时调用。</p>
        ) : (
          <div className="space-y-2">
            {agentEntries.map(([name, a]) => (
              <div key={name} className="flex items-center justify-between border-b border-white/5 py-2 last:border-0">
                <span className="text-sm text-white/80">{name}</span>
                <div className="flex gap-6 text-right text-xs text-white/50">
                  <span>{fmtInt(a.calls)} 次</span>
                  <span>{fmtInt(a.tokens)} Token</span>
                  <span>{fmtMoney(a.costUsd)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* 额度设置 */}
      <GlassCard className="p-6">
        <h3 className="mb-4 text-sm font-medium text-white/70">调用额度设置</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-white/50">每日最大调用次数</span>
            <input
              type="number"
              min={1}
              value={dailyCalls}
              onChange={(e) => setDailyCalls(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-electric"
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/50">每月最大 Token</span>
            <input
              type="number"
              min={1000}
              step={1000}
              value={monthlyTokens}
              onChange={(e) => setMonthlyTokens(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-electric"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveQuota}
            disabled={saving}
            className="rounded-full border border-brand-electric/30 bg-brand-electric/10 px-4 py-2 text-xs font-medium text-brand-electric transition hover:bg-brand-electric/20 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存额度"}
          </button>
          {savedAt && <span className="text-[11px] text-emerald-300">已保存 · {fmtTime(savedAt)}</span>}
        </div>
      </GlassCard>
    </div>
  );
}
