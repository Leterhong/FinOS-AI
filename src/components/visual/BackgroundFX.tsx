"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";

/**
 * BackgroundFX — 金融级 AI 操作系统背景层
 * 深空黑渐变基底 + 微弱星云纹理 + 极细科技网格 + 财富数据流线 +
 * 金融曲线轨迹 + 低亮度动态粒子。鼠标移动产生微视差（非飘浮大光球）。
 * 纯装饰、pointer-events:none，固定于页面最底层（z-0）。
 */

// 金融曲线轨迹（金融分形 / 财富增长路径意象）
const CURVES = [
  "M -120 640 C 280 480, 520 760, 840 560 S 1280 360, 1640 540",
  "M -120 360 C 320 280, 560 520, 880 360 S 1320 220, 1640 380",
  "M -120 820 C 300 740, 560 900, 900 760 S 1360 700, 1640 820",
];

// 财富数据流线（承载流动光点）
const FLOW_LINES = [
  { x1: 0, y1: 220, x2: 1440, y2: 120, color: "#00D68F" },
  { x1: 0, y1: 460, x2: 1440, y2: 540, color: "#0EA5E9" },
  { x1: 0, y1: 700, x2: 1440, y2: 640, color: "#00D68F" },
  { x1: 220, y1: 0, x2: 460, y2: 900, color: "#0EA5E9" },
];

// 低亮度动态粒子（固定坐标，避免 hydration 不一致）
const PARTICLES = [
  { x: 12, y: 22, d: 0 },
  { x: 35, y: 15, d: 1.2 },
  { x: 58, y: 28, d: 0.6 },
  { x: 74, y: 18, d: 1.8 },
  { x: 88, y: 34, d: 0.3 },
  { x: 20, y: 48, d: 2.1 },
  { x: 44, y: 52, d: 0.9 },
  { x: 66, y: 44, d: 1.5 },
  { x: 84, y: 58, d: 0.4 },
  { x: 16, y: 72, d: 1.1 },
  { x: 38, y: 80, d: 2.3 },
  { x: 62, y: 74, d: 0.7 },
  { x: 80, y: 82, d: 1.6 },
  { x: 50, y: 90, d: 2.6 },
];

export default function BackgroundFX({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: MouseEvent) => {
      px.set((e.clientX / window.innerWidth - 0.5) * 2);
      py.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduce, px, py]);

  const spring = { stiffness: 50, damping: 22, mass: 0.6 };
  const gridX = useSpring(useTransform(px, (v) => v * -12), spring);
  const gridY = useSpring(useTransform(py, (v) => v * -12), spring);
  const nebX = useSpring(useTransform(px, (v) => v * -26), spring);
  const nebY = useSpring(useTransform(py, (v) => v * -26), spring);
  const curveX = useSpring(useTransform(px, (v) => v * -8), spring);
  const curveY = useSpring(useTransform(py, (v) => v * -8), spring);
  const partX = useSpring(useTransform(px, (v) => v * -18), spring);
  const partY = useSpring(useTransform(py, (v) => v * -18), spring);

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden bg-midnight ${className}`}
      aria-hidden="true"
    >
      {/* 深空黑渐变基底 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% -10%, #0B1119 0%, #05070A 55%, #04060A 100%)",
        }}
      />

      {/* 微弱星云纹理（极淡、模糊、静止，非漂浮大光球） */}
      <motion.div style={{ x: nebX, y: nebY }} className="absolute inset-0">
        <div
          className="absolute -left-32 -top-32 h-[60vw] w-[60vw] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(0,214,143,0.10) 0%, transparent 60%)",
            filter: "blur(80px)",
          }}
        />
        <div
          className="absolute -right-40 bottom-0 h-[55vw] w-[55vw] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 60%)",
            filter: "blur(90px)",
          }}
        />
      </motion.div>

      {/* 极细科技网格 */}
      <motion.div style={{ x: gridX, y: gridY }} className="absolute inset-0 opacity-60">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "46px 46px",
            maskImage:
              "radial-gradient(ellipse 80% 70% at 50% 40%, #000 25%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 70% at 50% 40%, #000 25%, transparent 100%)",
          }}
        />
      </motion.div>

      {/* 财富轨迹曲线 + 数据流线 */}
      <motion.div style={{ x: curveX, y: curveY }} className="absolute inset-0">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="fxCurve" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00D68F" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.3" />
            </linearGradient>
            <filter id="fxGlow2" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 金融曲线轨迹 */}
          {CURVES.map((d, i) => (
            <motion.path
              key={`curve-${i}`}
              d={d}
              fill="none"
              stroke="url(#fxCurve)"
              strokeWidth={1.4}
              strokeLinecap="round"
              filter="url(#fxGlow2)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 0.85, 0.5] }}
              transition={{
                duration: 5 + i,
                delay: i * 0.5,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
            />
          ))}

          {/* 财富数据流线 + 流动光点 */}
          {FLOW_LINES.map((l, i) => (
            <g key={`flow-${i}`}>
              <line
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke={l.color}
                strokeOpacity={0.12}
                strokeWidth={1}
              />
              {/* 正向光点 */}
              <motion.circle
                r={2.4}
                fill={l.color}
                filter="url(#fxGlow2)"
                initial={{ cx: l.x1, cy: l.y1 }}
                animate={{ cx: [l.x1, l.x2], cy: [l.y1, l.y2] }}
                transition={{
                  duration: 4 + i,
                  repeat: Infinity,
                  ease: "linear",
                  delay: i * 0.4,
                }}
              />
              {/* 反向光点（错峰，增强数据流动感） */}
              <motion.circle
                r={1.8}
                fill={l.color}
                filter="url(#fxGlow2)"
                initial={{ cx: l.x2, cy: l.y2 }}
                animate={{ cx: [l.x2, l.x1], cy: [l.y2, l.y1] }}
                transition={{
                  duration: 4 + i,
                  repeat: Infinity,
                  ease: "linear",
                  delay: i * 0.4 + 2,
                }}
              />
            </g>
          ))}
        </svg>
      </motion.div>

      {/* 低亮度动态粒子 */}
      <motion.div style={{ x: partX, y: partY }} className="absolute inset-0">
        {PARTICLES.map((p, i) => (
          <motion.span
            key={`p-${i}`}
            className="absolute h-1 w-1 rounded-full bg-white/40"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            animate={{
              y: [0, -14, 0],
              opacity: [0.05, 0.35, 0.05],
            }}
            transition={{
              duration: 5 + (i % 5),
              delay: p.d,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}
