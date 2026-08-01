"use client";

import { motion } from "framer-motion";

type NetNode = {
  key: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  tone: "blue" | "green";
};

const CENTER = { x: 320, y: 204 };

const NODES: NetNode[] = [
  { key: "cashflow", label: "Cash Flow", sublabel: "LIQUIDITY", x: 320, y: 58, tone: "green" },
  { key: "investment", label: "Investment", sublabel: "GROWTH", x: 510, y: 135, tone: "blue" },
  { key: "risk", label: "Risk", sublabel: "PROTECTION", x: 510, y: 286, tone: "green" },
  { key: "retirement", label: "Retirement", sublabel: "LONG TERM", x: 320, y: 350, tone: "blue" },
  { key: "strategy", label: "Strategy", sublabel: "DECISIONS", x: 130, y: 286, tone: "green" },
];

const toneColor = (tone: NetNode["tone"]) => (tone === "blue" ? "#0EA5E9" : "#00D68F");

export default function AgentNetwork({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full ${className}`}>
      <div className="pointer-events-none absolute left-5 top-4 z-10 text-[10px] uppercase tracking-[0.2em] text-white/35">
        Live orchestration map
      </div>
      <div className="pointer-events-none absolute right-5 top-4 z-10 flex items-center gap-3 text-[9px] tracking-[0.14em] text-white/40">
        <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-semantic-success" />ONLINE</span>
        <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-brand-electric" />SYNCED</span>
      </div>
      <svg viewBox="0 0 640 420" className="w-full" role="img" aria-label="AI CFO 智能体协同拓扑">
        <defs>
          <radialGradient id="netCenter" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.95" />
            <stop offset="75%" stopColor="#075985" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#00D68F" stopOpacity="0.15" />
          </radialGradient>
          <filter id="netGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={CENTER.x} cy={CENTER.y} r="116" fill="none" stroke="#0EA5E9" strokeOpacity="0.08" strokeDasharray="2 9" />
        <circle cx={CENTER.x} cy={CENTER.y} r="154" fill="none" stroke="#00D68F" strokeOpacity="0.05" strokeDasharray="1 12" />
        {NODES.map((n, i) => {
          const color = toneColor(n.tone);
          return <motion.line key={`line-${n.key}`} x1={CENTER.x} y1={CENTER.y} x2={n.x} y2={n.y} stroke={color} strokeWidth="1.5" strokeOpacity="0.3" strokeDasharray="3 8" animate={{ strokeDashoffset: [0, -22] }} transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: i * 0.15 }} />;
        })}
        {NODES.map((n, i) => {
          const color = toneColor(n.tone);
          return <g key={n.key}>
            <circle cx={n.x} cy={n.y} r="32" fill="rgba(255,255,255,0.035)" stroke={color} strokeOpacity="0.45" strokeWidth="1.5" filter="url(#netGlow)" />
            <motion.circle cx={n.x} cy={n.y} r="5" fill={color} animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.45, 1] }} transition={{ duration: 2.2 + (i % 3) * 0.25, repeat: Infinity, delay: i * 0.25 }} style={{ transformOrigin: `${n.x}px ${n.y}px` }} />
            <text x={n.x} y={n.y + 53} textAnchor="middle" className="fill-white/75" style={{ fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>{n.label}</text>
            <text x={n.x} y={n.y + 68} textAnchor="middle" fill={color} style={{ fontSize: 8, letterSpacing: 1.6, fontFamily: "inherit" }}>{n.sublabel} · ONLINE</text>
          </g>;
        })}
        <motion.circle cx={CENTER.x} cy={CENTER.y} r="52" fill="url(#netCenter)" stroke="#0EA5E9" strokeOpacity="0.75" strokeWidth="1.5" filter="url(#netGlow)" animate={{ scale: [1, 1.025, 1] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px` }} />
        <circle cx={CENTER.x} cy={CENTER.y} r="62" fill="none" stroke="#00D68F" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 7" />
        <text x={CENTER.x} y={CENTER.y - 3} textAnchor="middle" className="fill-white" style={{ fontSize: 15, fontWeight: 700, fontFamily: "inherit" }}>AI CFO</text>
        <text x={CENTER.x} y={CENTER.y + 15} textAnchor="middle" className="fill-white/65" style={{ fontSize: 8.5, letterSpacing: 1.4, fontFamily: "inherit" }}>ORCHESTRATOR</text>
      </svg>
    </div>
  );
}
