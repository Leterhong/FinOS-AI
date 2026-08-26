import { cn } from "@/lib/utils";

export interface LogoProps {
  size?: number;
  className?: string;
  rounded?: boolean;
  showWordmark?: boolean;
}

/**
 * FinOS AI 矢量品牌标识。
 * 由“F / 金融增长曲线 / AI 节点”组合而成，纯 TSX + SVG，不依赖位图。
 */
export default function Logo({
  size = 40,
  className,
  rounded = true,
  showWordmark = false,
}: LogoProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-3", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-grid shrink-0 place-items-center overflow-hidden border border-white/12 bg-[#09131c] shadow-[0_10px_30px_rgba(0,214,143,.18),inset_0_1px_0_rgba(255,255,255,.12)]",
          rounded && "rounded-[28%]",
        )}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 48 48" className="h-full w-full" role="img" aria-label="FinOS AI">
          <defs>
            <linearGradient id="finos-mark-bg" x1="6" y1="4" x2="42" y2="44">
              <stop stopColor="#0d2730" />
              <stop offset="1" stopColor="#071019" />
            </linearGradient>
            <linearGradient id="finos-mark-line" x1="10" y1="38" x2="39" y2="9">
              <stop stopColor="#22e6a8" />
              <stop offset="0.56" stopColor="#18bff2" />
              <stop offset="1" stopColor="#3b82f6" />
            </linearGradient>
            <filter id="finos-mark-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="1.4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect width="48" height="48" rx="13" fill="url(#finos-mark-bg)" />
          <path d="M13 35V14.5C13 12.57 14.57 11 16.5 11H33" fill="none" stroke="url(#finos-mark-line)" strokeWidth="4" strokeLinecap="round" />
          <path d="M15 24H27.5" fill="none" stroke="url(#finos-mark-line)" strokeWidth="4" strokeLinecap="round" />
          <path d="M24 34.5L30 28.5L34.5 31L40 23" fill="none" stroke="url(#finos-mark-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#finos-mark-glow)" />
          <circle cx="40" cy="23" r="2.5" fill="#8fffe0" />
          <circle cx="33" cy="11" r="2.25" fill="#6ee7ff" />
          <circle cx="15" cy="24" r="1.65" fill="#d8fff3" />
        </svg>
        <span className="absolute inset-x-1.5 top-1 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      </span>

      {showWordmark && (
        <span className="min-w-0 leading-none">
          <span className="block text-[15px] font-bold tracking-[-0.02em] text-white">
            FinOS <span className="text-semantic-success">AI</span>
          </span>
          <span className="mt-1 block text-[8px] font-semibold uppercase tracking-[0.22em] text-white/35">
            Enterprise Financial Agent
          </span>
        </span>
      )}
    </span>
  );
}
