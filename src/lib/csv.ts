/** CSV 单元格转义：加引号、转义引号，并防止公式注入（= + - @ 及制表/回车开头）。 */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}
