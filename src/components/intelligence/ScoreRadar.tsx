"use client";

import { motion } from "framer-motion";
import type { WealthDimension } from "@/types/intelligence";

interface ScoreRadarProps {
  dimensions: WealthDimension[];
  size?: number;
  max?: number;
}

/**
 * 六维财富健康评分雷达图（纯 SVG，无第三方依赖）。
 * 维度顺序固定：资产结构 / 现金流 / 风险控制 / 目标达成 / 投资效率 / 保障水平。
 */
export default function ScoreRadar({ dimensions, size = 280, max = 100 }: ScoreRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 46; // 留出标签空间
  const n = dimensions.length;
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  const pointAt = (i: number, value: number) => {
    const r = (Math.max(0, Math.min(max, value)) / max) * radius;
    const a = angleFor(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const dataPoints = dimensions.map((d, i) => pointAt(i, d.score));
  const dataPath = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const colors = ["#00D68F", "#0EA5E9"];

  return (
    <svg width={size} height={size} className="mx-auto">
      <defs>
        <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors[0]} stopOpacity={0.35} />
          <stop offset="100%" stopColor={colors[1]} stopOpacity={0.25} />
        </linearGradient>
      </defs>

      {/* 网格环 */}
      {rings.map((rr, idx) => (
        <polygon
          key={idx}
          points={dimensions
            .map((_, i) => {
              const p = pointAt(i, rr * max);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
      ))}

      {/* 轴线 + 标签 */}
      {dimensions.map((d, i) => {
        const edge = pointAt(i, max);
        const labelPt = pointAt(i, max + 18);
        return (
          <g key={d.key}>
            <line
              x1={cx}
              y1={cy}
              x2={edge.x}
              y2={edge.y}
              stroke="rgba(255,255,255,0.10)"
              strokeWidth={1}
            />
            <text
              x={labelPt.x}
              y={labelPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-white/55"
              style={{ fontSize: 11 }}
            >
              {d.label}
            </text>
            <text
              x={labelPt.x}
              y={labelPt.y + 13}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-white/30"
              style={{ fontSize: 10 }}
            >
              {d.score}
            </text>
          </g>
        );
      })}

      {/* 数据多边形 */}
      <motion.polygon
        points={dataPath}
        fill="url(#radarFill)"
        stroke={colors[0]}
        strokeWidth={2}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={colors[0]} />
      ))}
    </svg>
  );
}
