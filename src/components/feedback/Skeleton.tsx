/** 统一加载骨架。 */
export function Skeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-4 animate-pulse rounded bg-white/[0.06]" style={{ width: `${90 - index * 12}%` }} />
      ))}
    </div>
  );
}
