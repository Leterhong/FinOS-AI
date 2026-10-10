/**
 * 重字段裁剪护盾：表格行数与长文本在写入（内存/持久化/服务端推送）前统一裁剪，
 * 避免超大 tables / 长文本撑爆 localStorage 配额或造成无界存储。
 * 三处保持同一份裁剪，防止“刷新后用裁剪版覆盖服务端完整数据”。
 */

export function capText(value: string | undefined | null, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

/** 表格：保留前 maxTables 张、每张前 maxRows 行。 */
export function capTables<T extends { rows?: unknown[] }>(
  tables: T[] | undefined | null,
  maxTables = 100,
  maxRows = 300,
): T[] | undefined {
  if (!Array.isArray(tables)) return tables ?? undefined;
  return tables.slice(0, maxTables).map((table) =>
    table && Array.isArray(table.rows) ? { ...table, rows: table.rows.slice(0, maxRows) } : table,
  );
}
