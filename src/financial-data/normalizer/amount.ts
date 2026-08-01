/**
 * 金额归一化 —— 把各种来源的金额字符串统一为数字（CNY）。
 * 纯函数，客户端 / 服务端共享。
 */

/** 解析金额字符串为数字，失败返回 null。保留正负号。 */
export function parseAmount(input?: string): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // 去币种符号与单位
  s = s.replace(/[¥￥$€£]|CNY|RMB|元/gi, "").trim();

  // 括号表示负数：(123.45)
  let negative = false;
  const paren = s.match(/^\((.+)\)$/);
  if (paren) {
    negative = true;
    s = paren[1];
  }

  // 前置 +/-
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  // 千分位
  s = s.replace(/,/g, "").trim();

  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

/**
 * 判断原始类型文案是否表示支出。
 * 返回: "income" | "expense" | null（无法判断）
 */
export function directionFromRawType(rawType?: string): "income" | "expense" | null {
  if (!rawType) return null;
  const s = rawType.trim().toLowerCase();
  if (!s) return null;

  const incomeWords = ["收入", "收", "贷", "入账", "转入", "credit", "cr", "deposit", "in"];
  const expenseWords = ["支出", "支", "借", "出账", "转出", "消费", "debit", "dr", "withdraw", "out"];

  // 完全匹配优先
  if (incomeWords.includes(s)) return "income";
  if (expenseWords.includes(s)) return "expense";
  // 包含匹配（先支出，避免「收支」类文案误判）
  if (expenseWords.some((w) => s.includes(w))) return "expense";
  if (incomeWords.some((w) => s.includes(w))) return "income";
  return null;
}
