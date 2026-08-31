import Link from "next/link";
import { Building2, CheckCircle2, ExternalLink, Laptop, ShieldAlert, XCircle } from "lucide-react";
import { PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";

const productionControls = [
  ["组织身份与单点登录", "把浏览器工作区会话替换为企业身份，绑定组织与成员。"],
  ["项目级权限", "至少区分查看、编辑、复核、审批和系统管理权限。"],
  ["持久化与留存", "使用 PostgreSQL、受控对象存储、备份、删除和法定留存策略。"],
  ["不可抵赖审计", "对模型配置、资料、规则、风险确认和审批写入追加式审计日志。"],
  ["模型与数据治理", "完成模型供应商、数据地域、保留策略、敏感字段和跨境评估。"],
  ["运行安全", "启用 HTTPS、独立强密钥、网络出口限制、监控、告警和恢复演练。"],
] as const;

export default function DeploymentPage() {
  return <div className="page-shell">
    <PageIntro eyebrow="Deployment boundary" title="部署与合规准备" description="明确区分开源单机体验和企业生产环境，避免把易用的本地工作区误当作已经完成多租户与监管控制的 SaaS。" actions={<Link href="https://github.com/Leterhong/FinOS-AI/blob/main/docs/deployment.md" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300">查看部署文档<ExternalLink className="h-3.5 w-3.5" /></Link>} />

    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="border-cyan-400/15 p-5">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/[0.08]"><Laptop className="h-5 w-5 text-cyan-300" /></div><div><p className="text-[10px] uppercase tracking-[.16em] text-cyan-300/60">Current default</p><h2 className="mt-1 text-sm font-semibold text-white">开源单机体验模式</h2></div></div>
        <p className="mt-4 text-xs leading-6 text-slate-400">适合本机试用、产品评估和非敏感资料验证。无需登录即可直达产品，但工作区身份主要依赖当前浏览器会话。</p>
        <div className="mt-4 space-y-2">{["零预置业务数据", "自带大模型并在服务端加密密钥", "项目、证据、规则、风险与人工流程闭环", "开发环境可使用本地文件与 SQLite"].map((item) => <div key={item} className="flex items-center gap-2 text-[11px] text-slate-300"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />{item}</div>)}</div>
        <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[10px] leading-5 text-amber-100/70"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" />不适合公开匿名部署、共享设备、多人协作审批或承载真实客户机密。</div>
      </Panel>

      <Panel className="p-5">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-400/[0.08]"><Building2 className="h-5 w-5 text-blue-300" /></div><div><p className="text-[10px] uppercase tracking-[.16em] text-blue-300/60">Deployment target</p><h2 className="mt-1 text-sm font-semibold text-white">企业生产模式</h2></div></div>
        <p className="mt-4 text-xs leading-6 text-slate-400">代码库提供企业对象、后端接口和安全基线，但不会自动替部署者完成组织治理与监管责任。</p>
        <div className="mt-4 space-y-2">{["组织身份、SSO 与成员生命周期尚需接入", "RBAC、项目授权与审批隔离尚需实施", "生产审计、告警、备份与灾备尚需部署", "隐私政策、数据授权与监管评估由部署者负责"].map((item) => <div key={item} className="flex items-start gap-2 text-[11px] leading-5 text-slate-400"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />{item}</div>)}</div>
      </Panel>
    </div>

    <Panel>
      <PanelHeader eyebrow="Production gate" title="企业上线控制项" description="以下是进入真实业务数据环境前的最低治理范围，不代表通过某项认证。" />
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">{productionControls.map(([title, description], index) => <article key={title} className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4"><span className="numeric text-[10px] text-cyan-300/50">0{index + 1}</span><h3 className="mt-2 text-xs font-medium text-slate-200">{title}</h3><p className="mt-2 text-[10px] leading-5 text-slate-500">{description}</p></article>)}</div>
    </Panel>
  </div>;
}
