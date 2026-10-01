"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, Loader2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import { Select } from "@/components/ui/Select";
import { backendAuthedFetch } from "@/lib/enterprise-sync";

interface DatasetMeta {
  id: string;
  label: string;
  category: string;
  unit: string;
}

export default function AksharePanel() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [dataset, setDataset] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const resp = await backendAuthedFetch("/api/data-sources/akshare/datasets");
        const payload = await resp.json() as { data?: { datasets?: DatasetMeta[] }; error?: string };
        if (!resp.ok) throw new Error(payload?.error || "加载数据源失败");
        const list = payload.data?.datasets ?? [];
        setDatasets(list);
        if (list.length) setDataset(list[0].id);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "加载数据源失败");
      }
    })();
  }, []);

  useEffect(() => {
    if (!dataset) return;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await backendAuthedFetch(`/api/data-sources/akshare/${encodeURIComponent(dataset)}?limit=12`);
        const payload = await resp.json() as { data?: { rows?: Array<Record<string, unknown>> }; error?: string };
        if (!resp.ok) throw new Error(payload?.error || "加载数据失败");
        setRows(payload.data?.rows ?? []);
      } catch (reason) {
        setRows([]);
        setError(reason instanceof Error ? reason.message : "加载数据失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [dataset]);

  const columns = rows.length ? Object.keys(rows[0]).slice(0, 8) : [];

  return <Panel>
    <PanelHeader
      eyebrow="External data · AKShare"
      title="外部宏观与汇率数据"
      description="来自开源免费数据源 AKShare，仅作研判参考；外部数据需人工复核，不自动写入项目结论。"
      action={<Select value={dataset} onChange={setDataset} className="min-w-56" options={datasets.map((item) => ({ value: item.id, label: `${item.category} · ${item.label}` }))} placeholder="选择数据集" />}
    />
    <div className="p-5">
      {error && <p className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200">{error}</p>}
      {loading ? <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-cyan-300" />正在获取外部数据…</div>
        : rows.length === 0 ? <div className="flex items-center gap-2 text-xs text-slate-600"><DatabaseZap className="h-4 w-4" />暂无数据</div>
        : <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead><tr>{columns.map((column) => <th key={column} className="border-b border-white/10 px-3 py-2 font-medium text-cyan-200/80">{column}</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => <tr key={index} className="odd:bg-white/[0.02]">{columns.map((column) => <td key={column} className="border-b border-white/[0.06] px-3 py-2 text-slate-300">{row[column] === null || row[column] === undefined ? "—" : String(row[column])}</td>)}</tr>)}</tbody>
          </table>
          <p className="mt-2 text-[10px] text-slate-600">外部来源（AKShare）· 最近 {rows.length} 条 · 需人工复核</p>
        </div>}
    </div>
  </Panel>;
}
