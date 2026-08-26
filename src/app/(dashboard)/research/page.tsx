"use client";

import { FormEvent, useState } from "react";
import { ArrowUpRight, Building2, Newspaper, TrendingDown, TrendingUp } from "lucide-react";
import { PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { useEnterpriseStore } from "@/store/enterprise-store";

const intelligence = [
  { icon: TrendingUp, title: "新能源材料", metric: "碳酸锂现货价格 30 日上涨 12.6%", detail: "成本传导能力决定毛利修复节奏" },
  { icon: TrendingDown, title: "生物医药并购", metric: "可比交易估值中枢环比下降 8.3%", detail: "关注对赌条款与商誉减值压力" },
  { icon: Building2, title: "高端装备出口", metric: "海外订单保持增长但审查周期延长", detail: "合规成本与回款周期需同步计入" },
  { icon: Newspaper, title: "监管观察", metric: "供应链金融强调交易背景真实性", detail: "发票、物流与资金流需交叉核验" },
];

const sources = [
  ["监管与政府来源", "14", "100%"],
  ["企业公开披露", "18", "96%"],
  ["专业研究机构", "9", "91%"],
  ["新闻与舆情", "5", "78%"],
];

export default function ResearchPage() {
  const briefs = useEnterpriseStore((state) => state.briefs);
  const createBrief = useEnterpriseStore((state) => state.createBrief);
  const [open,setOpen] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); createBrief(String(data.get("topic"))); setOpen(false); };
  return (
    <div className="page-shell">
      <PageIntro eyebrow="Research intelligence" title="企业投研中心" description="把行业、公司、政策、市场与舆情信息整理成可引用的研究底稿，为经营判断与风险研判提供外部参照。" actions={<button onClick={() => setOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">生成专题研究</button>} />
      {briefs.map(brief => <Panel key={brief.id} className="border-cyan-400/15 bg-cyan-400/[0.035] p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.16em] text-cyan-300/60">新生成 · {brief.createdAt}</p><h2 className="mt-2 text-sm font-semibold text-white">{brief.title}</h2><p className="mt-2 text-xs leading-5 text-slate-400">{brief.summary}</p></div><span className="rounded-md border border-cyan-400/15 px-2 py-1 text-[10px] text-cyan-300">研究底稿</span></div></Panel>)}
      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <Panel>
          <PanelHeader eyebrow="Daily brief" title="今日经营与行业情报" description="Agent 已合并 46 个可信来源，去重后保留 12 条关键变化" />
          <div className="p-5">
            <div className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-400/[0.08] to-blue-500/[0.03] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-cyan-300/70">AI Executive Brief</p>
              <h2 className="mt-3 text-lg font-semibold text-white">制造业企业经营韧性分化，现金流与订单质量成为核心观察项</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">近期原材料成本回升，但终端需求修复仍不均衡。对在手项目而言，应重点核验收入增长是否转化为经营现金流，并关注大客户账期拉长与供应链议价变化。</p>
              <div className="mt-4 flex flex-wrap gap-2">{["经营现金流", "客户集中度", "原材料价格", "融资成本"].map(tag => <span key={tag} className="rounded-md border border-white/[0.08] bg-black/10 px-2 py-1 text-[10px] text-slate-400">{tag}</span>)}</div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {intelligence.map(item => { const Icon = item.icon; return <article key={item.title} className="rounded-xl border border-white/[0.07] p-4"><Icon className="h-4 w-4 text-cyan-300" /><h3 className="mt-3 text-xs font-semibold text-slate-200">{item.title}</h3><p className="mt-2 text-xs text-slate-300">{item.metric}</p><p className="mt-1.5 text-[10px] leading-5 text-slate-600">{item.detail}</p></article>; })}
            </div>
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel>
            <PanelHeader eyebrow="Watchlist" title="项目关联观察" />
            <div className="divide-y divide-white/[0.06]">{[["晟远新能源", "原料价格 / 应收账款", "2 项变化"], ["华辰精工", "出口政策 / 核心客户", "1 项变化"], ["科泽生物", "并购交易 / 医保政策", "3 项变化"]].map(([name, tags, count]) => <button key={name} className="flex w-full items-center justify-between px-4 py-4 text-left hover:bg-white/[0.025]"><div><p className="text-xs font-medium text-slate-200">{name}</p><p className="mt-1 text-[10px] text-slate-600">{tags}</p></div><span className="text-[10px] text-amber-300">{count}</span></button>)}</div>
          </Panel>
          <Panel>
            <PanelHeader eyebrow="Sources" title="来源可信度" />
            <div className="space-y-3 p-4">
              {sources.map(([name, count, score]) => <div key={name}><div className="flex justify-between text-[11px]"><span className="text-slate-400">{name}</span><span className="numeric text-slate-600">{count} 个 · {score}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-cyan-300" style={{ width: score }} /></div></div>)}
              <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] py-2.5 text-xs text-slate-400">管理研究来源<ArrowUpRight className="h-3 w-3" /></button>
            </div>
          </Panel>
        </div>
      </div>
      <EnterpriseDialog open={open} onClose={() => setOpen(false)} title="生成专题研究" description="输入主题后创建一份项目研究底稿"><form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">研究主题</span><input required name="topic" placeholder="例如：新能源材料价格上涨对授信客户的影响" className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">研究范围</span><textarea name="scope" rows={3} placeholder="政策、行业、可比公司、舆情与风险传导" className="field-control resize-none" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">生成研究底稿</button></div></form></EnterpriseDialog>
    </div>
  );
}
