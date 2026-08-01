import { classifyIntent, parseNumber } from "../src/ai/intent/router.ts";

const cases: [string, string, unknown?][] = [
  // [输入, 期望意图, 期望 profileUpdate.value(可选)]
  ["你好", "greeting"],
  ["您好", "greeting"],
  ["在吗", "greeting"],
  ["你是谁", "greeting"],
  ["你是什么", "greeting"],
  ["你使用什么模型", "model_info"],
  ["当前模型是什么", "model_info"],
  ["你用的什么模型", "model_info"],
  ["我的资产怎么样", "financial_analysis"],
  ["我的现金流怎么样", "financial_analysis"],
  ["如何退休规划", "financial_analysis"],
  ["我的退休风险高吗", "financial_analysis"],
  ["修改我的年龄", "profile_update"],
  ["更新收入", "profile_update"],
  ["我的年龄是30", "profile_update", 30],
  ["月收入 20000 元", "profile_update", 20000],
  ["把负债改成 50万", "profile_update", 500000],
  ["月收入 20000 元", "profile_update", 20000],
  ["我基金亏了5000", "financial_analysis"],
  ["如何投资50000", "financial_analysis"],
  ["什么是股票", "general_question"],
  ["什么是基金", "general_question"],
  ["ETF 和基金的区别", "general_question"],
  ["今天天气不错", "general_question"],
  ["帮我制定一个存钱计划", "financial_analysis"],
];

let pass = 0;
let fail = 0;
for (const [q, exp, expVal] of cases) {
  const r = classifyIntent(q);
  const got = r.intent;
  const ok = got === exp;
  let valOk = true;
  if (ok && expVal !== undefined) {
    valOk = r.profileUpdate?.value === expVal;
  }
  if (ok && valOk) pass++;
  else fail++;
  const extra = r.profileUpdate ? ` value=${r.profileUpdate.value}` : "";
  console.log(`${ok && valOk ? "PASS" : "FAIL"}  "${q}" => ${got}${extra} (expect ${exp}${expVal !== undefined ? "=" + expVal : ""})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
