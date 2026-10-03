"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DatabaseZap, Loader2, Search } from "lucide-react";
import { Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import { Select } from "@/components/ui/Select";
import { backendAuthedFetch } from "@/lib/enterprise-sync";
import { ensureWorkspaceSession } from "@/lib/workspace-session";

type ProviderId = "akshare" | "fx" | "worldbank" | "gleif" | "sec";

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "akshare", label: "AKShare · 宏观/汇率" },
  { id: "fx", label: "汇率（ECB）" },
  { id: "worldbank", label: "世界银行 · 宏观指标" },
  { id: "gleif", label: "GLEIF · 企业主体（LEI）" },
  { id: "sec", label: "SEC EDGAR · 美股财务" },
];

export default function ExternalDataPanel() {
  const [provider, setProvider] = useState<ProviderId>("akshare");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadSeq = useRef(0);
  // provider-specific params
  const [datasets, setDatasets] = useState<Array<{ id: string; label: string; category: string }>>([]);
  const [dataset, setDataset] = useState("");
  const [base, setBase] = useState("USD");
  const [symbols, setSymbols] = useState("CNY,EUR,JPY,HKD");
  const [country, setCountry] = useState("CN");
  const [indicators, setIndicators] = useState<Array<{ id: string; label: string }>>([]);
  const [indicator, setIndicator] = useState("NY.GDP.MKTP.CD");
  const [name, setName] = useState("");
  const [cik, setCik] = useState("");
  const [tags, setTags] = useState<Array<{ id: string; label: string }>>([]);
  const [tag, setTag] = useState("Revenues");

  useEffect(() => {
    void (async () => {
      // 先确保工作区会话就绪，避免首帧令牌尚未换发导致的 401。
      try { await ensureWorkspaceSession(); } catch { /* 忽略 */ }
      try {
        const resp = await backendAuthedFetch("/api/data-sources/akshare/datasets");
        const payload = await resp.json() as { data?: { datasets?: Array<{ id: string; label: string; category: string }> } };
        const list = payload.data?.datasets ?? [];
        setDatasets(list);
        if (list.length) setDataset(list[0].id);
      } catch { /* 忽略 */ }
      try {
        const resp = await backendAuthedFetch("/api/data-sources/external/meta");
        const payload = await resp.json() as { data?: { worldbankIndicators?: Array<{ id: string; label: string }>; secTags?: Array<{ id: string; label: string }> } };
        setIndicators(payload.data?.worldbankIndicators ?? []);
        setTags(payload.data?.secTags ?? []);
      } catch { /* 忽略 */ }
    })();
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    if (provider === "sec" && !cik.trim()) {
      setLoading(false);
      setRows([]);
      setError("请输入 SEC CIK 后再查询");
      return;
    }
    try {
      let url = "";
      if (provider === "akshare") url = `/api/data-sources/akshare/${encodeURIComponent(dataset)}?limit=12`;
      else if (provider === "fx") url = `/api/data-sources/fx/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(symbols)}`;
      else if (provider === "worldbank") url = `/api/data-sources/worldbank?country=${encodeURIComponent(country)}&indicator=${encodeURIComponent(indicator)}&limit=12`;
      else if (provider === "gleif") { if (!name.trim()) { setLoading(false); setRows([]); return; } url = `/api/data-sources/gleif?name=${encodeURIComponent(name)}&limit=8`; }
      else url = `/api/data-sources/sec?cik=${encodeURIComponent(cik)}&tag=${encodeURIComponent(tag)}&limit=10`;
      const resp = await backendAuthedFetch(url);
      const payload = await resp.json() as { data?: { rows?: Array<Record<string, unknown>> }; error?: string };
      if (seq !== loadSeq.current) return; // 数据源已切换，丢弃过期响应
      if (!resp.ok) throw new Error(payload?.error || "加载外部数据失败");
      setRows(payload.data?.rows ?? []);
    } catch (reason) {
      if (seq === loadSeq.current) {
        setRows([]);
        setError(reason instanceof Error ? reason.message : "加载外部数据失败");
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [provider, dataset, base, symbols, country, indicator, name, cik, tag]);

  // 切换数据源或 AKShare 数据集时自动加载
  useEffect(() => {
    if (provider === "akshare" && dataset) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, dataset]);

  const columns = rows.length ? Object.keys(rows[0]).slice(0, 8) : [];

  return <Panel>
    <PanelHeader
      eyebrow="External data"
      title="外部业务数据"
      description="来自公开官方数据源（AKShare / ECB / 世界银行 / GLEIF / SEC EDGAR），仅供研判参考，需人工复核，不自动写入项目结论。"
      action={<Select value={provider} onChange={(value) => setProvider(value as ProviderId)} className="min-w-56" options={PROVIDERS.map((item) => ({ value: item.id, label: item.label }))} />}
    />
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-end gap-3">
        {provider === "akshare" && <label className="block"><span className="mb-1 block text-[10px] text-slate-500">数据集</span><Select value={dataset} onChange={setDataset} className="min-w-56" options={datasets.map((item) => ({ value: item.id, label: `${item.category} · ${item.label}` }))} placeholder="选择数据集" /></label>}
        {provider === "fx" && <>
          <label className="block"><span className="mb-1 block text-[10px] text-slate-500">基准货币</span><input value={base} onChange={(e) => setBase(e.target.value.toUpperCase().slice(0, 3))} className="field-control w-28" /></label>
          <label className="block"><span className="mb-1 block text-[10px] text-slate-500">目标货币（逗号分隔）</span><input value={symbols} onChange={(e) => setSymbols(e.target.value.toUpperCase())} className="field-control w-56" /></label>
        </>}
        {provider === "worldbank" && <>
          <label className="block"><span className="mb-1 block text-[10px] text-slate-500">国家/地区代码</span><input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 3))} className="field-control w-28" /></label>
          <label className="block"><span className="mb-1 block text-[10px] text-slate-500">指标</span><Select value={indicator} onChange={setIndicator} className="min-w-56" options={indicators.map((item) => ({ value: item.id, label: item.label }))} /></label>
        </>}
        {provider === "gleif" && <label className="block"><span className="mb-1 block text-[10px] text-slate-500">企业名称</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 Apple / 华为" className="field-control w-72" /></label>}
        {provider === "sec" && <>
          <label className="block"><span className="mb-1 block text-[10px] text-slate-500">CIK（数字）</span><input value={cik} onChange={(e) => setCik(e.target.value.replace(/\D/g, "").slice(0, 10))} className="field-control w-40" /></label>
          <label className="block"><span className="mb-1 block text-[10px] text-slate-500">财务科目</span><Select value={tag} onChange={setTag} className="min-w-56" options={tags.map((item) => ({ value: item.id, label: item.label }))} /></label>
        </>}
        {provider !== "akshare" && <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:opacity-40">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}查询</button>}
      </div>

      {error && <p className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200">{error}</p>}
      {loading ? <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-cyan-300" />正在获取外部数据…</div>
        : rows.length === 0 ? <div className="flex items-center gap-2 text-xs text-slate-400"><DatabaseZap className="h-4 w-4" />暂无数据{provider === "gleif" ? "（请输入企业名称后查询）" : provider === "sec" ? "（请输入 CIK 后查询）" : ""}</div>
        : <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead><tr>{columns.map((column) => <th key={column} className="border-b border-white/10 px-3 py-2 font-medium text-cyan-200/80">{column}</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => <tr key={`${columns.map((column) => String(row[column] ?? "")).join("|")}-${index}`} className="odd:bg-white/[0.02]">{columns.map((column) => <td key={column} className="border-b border-white/[0.06] px-3 py-2 text-slate-300">{row[column] === null || row[column] === undefined ? "—" : String(row[column])}</td>)}</tr>)}</tbody>
          </table>
          <p className="mt-2 text-[10px] text-slate-400">外部来源 · 最近 {rows.length} 条 · 需人工复核</p>
        </div>}
    </div>
  </Panel>;
}
