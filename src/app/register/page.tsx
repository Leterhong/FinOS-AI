"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import GlassCard from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import Logo from "@/components/brand/Logo";
import { useToast } from "@/components/ui/use-toast";
import AgreementCheckbox from "@/components/auth/AgreementCheckbox";
import BackgroundFX from "@/components/visual/BackgroundFX";
import { useAuthStore } from "@/store/auth-store";
import {
  Sparkles,
  ArrowRight,
  Cpu,
  Network,
  Fingerprint,
} from "lucide-react";

const FEATURES = [
  {
    icon: Fingerprint,
    title: "Personal Financial Twin",
    desc: "个人财富数字分身 · 资产、现金流与目标的完整镜像",
  },
  {
    icon: Network,
    title: "Multi-Agent AI",
    desc: "投资 / 现金流 / 风险等多智能体协同分析",
  },
  {
    icon: Cpu,
    title: "Bring Your Own Model",
    desc: "接入你自己的大模型 API，密钥加密存储在本地服务",
  },
];

const AGREE_HINT = "请先阅读并同意用户服务协议和隐私政策";

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const { toast, Toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    if (!agreed) {
      toast(AGREE_HINT);
      return;
    }
    setLoading(true);
    const res = await register(email, password, name || undefined);
    if (!res.ok) {
      setError(res.error ?? "注册失败");
      setLoading(false);
      return;
    }
    router.replace("/onboarding/wealth");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* 金融级 AI 操作系统背景层 */}
      <BackgroundFX />

      <div className="relative z-10 grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
        {/* 左侧：品牌展示区 */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="hidden flex-col justify-center lg:flex"
        >
          <div className="flex items-center gap-3">
            <Logo size={52} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                FinOS AI
              </h1>
              <p className="text-[11px] uppercase tracking-[0.28em] text-brand-electric/70">
                Financial Intelligence OS
              </p>
            </div>
          </div>

          <div className="mt-10 space-y-4">
            <h2 className="text-5xl font-bold leading-[1.1] tracking-tight text-white">
              你的个人{" "}
              <span className="text-gradient-brand">AI CFO</span>
            </h2>
            <p className="max-w-md text-lg leading-relaxed text-white/55">
              让 AI 理解你的财富，预测未来，辅助你的每一次财务决策。
            </p>
          </div>

          <div className="mt-9 space-y-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 0.55 }}
              >
                <GlassCard className="flex items-center gap-4 rounded-2xl p-4 glow-ring glow-green-soft transition-transform duration-300 hover:-translate-y-0.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-blue">
                    <f.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-xs text-white/45">{f.desc}</p>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* 右侧：注册卡 */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
          className="flex items-center"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="w-full"
          >
            <GlassCard className="w-full rounded-3xl p-7 sm:p-8">
              <div className="mb-7 flex flex-col items-center text-center">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
                  <Sparkles className="h-6 w-6 text-white" />
                </span>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  创建你的 AI CFO 账户
                </h1>
                <p className="mt-1.5 text-sm text-white/40">
                  开启你的个人财富操作系统
                </p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                {/* 称呼 */}
                <div className="group relative">
                  <input
                    id="name"
                    type="text"
                    placeholder=" "
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="peer w-full rounded-xl bg-white/[0.04] px-4 pb-2 pt-6 text-sm text-white outline-none ring-1 ring-white/10 transition-all duration-200 hover:ring-white/20 focus:bg-white/[0.06] focus:ring-semantic-success/60"
                  />
                  <label
                    htmlFor="name"
                    className="pointer-events-none absolute left-4 top-4 text-sm text-white/40 transition-all duration-200 peer-focus:top-2 peer-focus:text-[11px] peer-focus:text-semantic-success/80 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[11px]"
                  >
                    称呼（可选）
                  </label>
                </div>

                {/* 邮箱 */}
                <div className="group relative">
                  <input
                    id="reg-email"
                    type="email"
                    placeholder=" "
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="peer w-full rounded-xl bg-white/[0.04] px-4 pb-2 pt-6 text-sm text-white outline-none ring-1 ring-white/10 transition-all duration-200 hover:ring-white/20 focus:bg-white/[0.06] focus:ring-semantic-success/60"
                  />
                  <label
                    htmlFor="reg-email"
                    className="pointer-events-none absolute left-4 top-4 text-sm text-white/40 transition-all duration-200 peer-focus:top-2 peer-focus:text-[11px] peer-focus:text-semantic-success/80 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[11px]"
                  >
                    邮箱
                  </label>
                </div>

                {/* 密码 */}
                <div className="group relative">
                  <input
                    id="reg-password"
                    type="password"
                    placeholder=" "
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="peer w-full rounded-xl bg-white/[0.04] px-4 pb-2 pt-6 text-sm text-white outline-none ring-1 ring-white/10 transition-all duration-200 hover:ring-white/20 focus:bg-white/[0.06] focus:ring-semantic-success/60"
                  />
                  <label
                    htmlFor="reg-password"
                    className="pointer-events-none absolute left-4 top-4 text-sm text-white/40 transition-all duration-200 peer-focus:top-2 peer-focus:text-[11px] peer-focus:text-semantic-success/80 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[11px]"
                  >
                    密码（至少 6 位）
                  </label>
                </div>

                {/* 确认密码 */}
                <div className="group relative">
                  <input
                    id="reg-confirm"
                    type="password"
                    placeholder=" "
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className="peer w-full rounded-xl bg-white/[0.04] px-4 pb-2 pt-6 text-sm text-white outline-none ring-1 ring-white/10 transition-all duration-200 hover:ring-white/20 focus:bg-white/[0.06] focus:ring-semantic-success/60"
                  />
                  <label
                    htmlFor="reg-confirm"
                    className="pointer-events-none absolute left-4 top-4 text-sm text-white/40 transition-all duration-200 peer-focus:top-2 peer-focus:text-[11px] peer-focus:text-semantic-success/80 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[11px]"
                  >
                    确认密码
                  </label>
                </div>

                {error && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                  </p>
                )}

                {/* 协议勾选置于按钮之前：先确认，再提交（默认不勾选） */}
                <div className="pt-1">
                  <AgreementCheckbox checked={agreed} onChange={setAgreed} />
                </div>

                <Button
                  type="submit"
                  disabled={loading || !agreed}
                  className="w-full"
                >
                  {loading ? "注册中…" : "创建我的 AI CFO"}
                  {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-white/40">
                已有账户？{" "}
                <Link
                  href="/login"
                  className="font-medium text-brand-electric hover:underline"
                >
                  去登录
                </Link>
              </p>
            </GlassCard>
          </motion.div>
        </motion.div>
      </div>
      {Toast}
    </div>
  );
}
