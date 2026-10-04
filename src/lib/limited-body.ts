/**
 * 有界请求体读取：以字节计数读取流，超过上限立即取消并返回 too_large，
 * 避免在解析前就把超大请求体整体缓冲进内存。
 */

export type LimitedBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" };

export async function readBodyWithLimit(req: Request, maxBytes: number): Promise<LimitedBodyResult> {
  const reader = req.body?.getReader();
  if (!reader) return { ok: true, text: "" };

  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { ok: true, text };
}
