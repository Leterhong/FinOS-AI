import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Logo from "@/components/brand/Logo";

export const metadata = {
  title: "隐私政策 · FinOS AI",
  description: "FinOS AI 隐私说明：企业研判资料、模型配置与部署责任边界。",
};

const SECTIONS = [
  {
    title: "1. 我们收集的信息",
    body: "FinOS AI 处理你主动创建的企业项目、上传的经营与财务资料、业务规则、风险线索、流程任务以及 AI 研判记录。开源单机体验模式不要求注册账号；部署者启用企业认证或外部存储时，应另行告知身份信息和日志的处理方式。请只上传你有权处理的资料。",
  },
  {
    title: "2. 数据存储与隔离",
    body: "默认开源体验以当前浏览器工作区保存业务状态，模型密钥由服务端使用 AES-256-GCM 加密文件保存。若启用项目自带的后端服务，企业对象按工作区身份隔离。是否使用数据库、对象存储、备份、日志平台以及数据所在地区，取决于实际部署配置；部署者必须配置独立密钥、访问控制、备份和留存策略，不能把示例配置当作生产安全承诺。",
  },
  {
    title: "3. AI 模型与你的数据",
    body: "FinOS AI 采用 Bring Your Own Model（BYOM）架构。发起资料分析、Agent、投研或助手请求时，当前企业项目的必要上下文会发送给你配置的模型服务商。模型服务商可能按其条款记录或留存请求，因此部署者应完成供应商评估、数据分级与授权，并避免向不受信任的模型发送敏感资料。没有可用模型时，系统不会伪造 AI 结果。",
  },
  {
    title: "4. 你的权利与数据删除",
    body: "你可以在工作区中查看或清空业务数据，并在模型中心管理或删除模型配置。当前开源版本尚未宣称提供完整的企业数据主体请求、法定留存、不可抵赖审计或跨系统删除能力；这些能力必须由实际部署者结合所在地区法规和企业制度实现。删除前请自行备份，部分部署的服务端备份或外部日志可能有独立留存周期。",
  },
  {
    title: "5. 联系我们",
    body: "这是开源项目说明，不代表某个托管服务运营方的完整隐私政策。部署者应提供自己的主体名称、联系方式、处理目的、数据位置、留存周期和权利申请渠道。项目问题可通过代码仓库的公开问题渠道反馈，但请勿在公开问题中提交企业机密或模型密钥。",
  },
];

export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            返回体验
          </Link>
          <Logo size={36} />
        </div>

        <div className="glass rounded-xl p-8 md:p-10">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-blue">
              <ShieldCheck className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                隐私政策
              </h1>
              <p className="text-xs text-white/40">FinOS AI · 最后更新 2026-07</p>
            </div>
          </div>

          <p className="mb-8 text-sm leading-relaxed text-white/60">
            企业经营、融资与风险资料通常包含敏感信息。本说明解释开源版 FinOS AI 的实际数据处理边界，不把规划中的企业能力写成已经交付的承诺。实际部署者仍需结合自身架构、供应商和适用法规提供完整隐私政策。
          </p>

          <div className="space-y-7">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h2 className="mb-2 text-base font-semibold text-white">
                  {s.title}
                </h2>
                <p className="text-sm leading-relaxed text-white/55">{s.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-10 border-t border-white/10 pt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-6 py-2.5 text-sm font-medium text-white shadow-glow-blue transition hover:shadow-glow-purple"
            >
              我已了解，进入 FinOS AI
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          FinOS AI · Enterprise Financial Agent
        </p>
      </div>
    </div>
  );
}
