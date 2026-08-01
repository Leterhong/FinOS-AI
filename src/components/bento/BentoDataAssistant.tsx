"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import GlassCard from "@/components/ui/GlassCard";
import {
  FileUp,
  FileText,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";

/**
 * 财富资料中心（Phase 6.7 需求一 / 十三）。
 * Dashboard Bento 卡片：展示已上传资料数 / 待确认数 / 已入画像数，
 * 引导用户上传财务资料，AI 理解后经确认写入财富画像。
 */
export default function BentoDataAssistant({ delay = 0 }: { delay?: number }) {
  const [stats, setStats] = useState<{
    total: number;
    needConfirm: number;
    confirmed: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/documents")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!alive || !json?.documents) return;
        const docs = json.documents as {
          analysis: { status: string } | null;
        }[];
        setStats({
          total: docs.length,
          needConfirm: docs.filter(
            (d) => d.analysis?.status === "needs_confirm"
          ).length,
          confirmed: docs.filter((d) => d.analysis?.status === "confirmed")
            .length,
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="h-full"
    >
      <GlassCard className="relative flex h-full flex-col overflow-hidden p-5" glow>
        {/* 头部 */}
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-purple">
            <FileUp className="h-5 w-5 text-white" />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              Wealth Document Center
            </p>
            <h3 className="text-base font-bold text-white">财富资料中心</h3>
          </div>
        </div>

        {stats === null || stats.total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <FileText className="mb-3 h-9 w-9 text-white/15" />
            <p className="mb-1 text-sm text-white/60">
              上传资料，AI 帮你建财富画像
            </p>
            <p className="mb-4 text-xs text-white/35">
              工资单 / 银行流水 / 持仓截图 / 保险合同，AI 自动理解，确认后写入数字分身
            </p>
            <Link
              href="/documents"
              className="rounded-xl bg-gradient-brand px-5 py-2 text-xs font-semibold text-white shadow-glow-purple transition hover:opacity-90"
            >
              上传第一份资料 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="grid grid-cols-3 gap-2">
              <MiniStat
                icon={<FileText className="h-3.5 w-3.5" />}
                label="资料"
                value={stats.total}
              />
              <MiniStat
                icon={<AlertCircle className="h-3.5 w-3.5 text-amber-300" />}
                label="待确认"
                value={stats.needConfirm}
              />
              <MiniStat
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}
                label="已入画像"
                value={stats.confirmed}
              />
            </div>
            {stats.needConfirm > 0 && (
              <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300 ring-1 ring-amber-500/20">
                有 {stats.needConfirm} 份资料的 AI 识别结果等待您确认
              </div>
            )}
            <div className="mt-auto pt-4">
              <Link
                href="/documents"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <FileUp className="h-3.5 w-3.5" />
                {stats.needConfirm > 0 ? "去确认识别结果 →" : "管理我的资料 →"}
              </Link>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-white/30">
          <ShieldCheck className="h-3 w-3 text-emerald-400/70" />
          资料加密存储，仅本人可见；AI 识别结果须确认后才写入画像
        </div>
      </GlassCard>
    </motion.div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="mb-1 flex items-center gap-1 text-white/35">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}
