// Phase 5.9 隔离校验：纯函数原语（不触碰文件系统 / 不触发 server-only）。
// 验证 EMPTY_PROFILE 与 isEmptyProfile 的正确性——这是「真实用户无数据即空态」的根基。
import { EMPTY_PROFILE, isEmptyProfile } from "../src/data/types.ts";
import type { FinancialProfile } from "../src/data/types.ts";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("  ✓ " + msg);
  } else {
    failures++;
    console.error("  ✗ " + msg);
  }
}

// 1) EMPTY_PROFILE 必须为全零中性占位，绝不含真实人物数据
assert(EMPTY_PROFILE.name === "", "EMPTY_PROFILE.name 为空（无 Alex Chen / 默认名）");
assert(EMPTY_PROFILE.goal.retirementAge === 0, "EMPTY_PROFILE 退休年龄为 0（无默认 60 岁）");
assert(EMPTY_PROFILE.goal.targetAmount === 0, "EMPTY_PROFILE 目标金额为 0（无默认 800 万）");
assert(EMPTY_PROFILE.monthlySalary === 0 && EMPTY_PROFILE.totalAssets === 0, "EMPTY_PROFILE 收入/资产为 0");
assert(EMPTY_PROFILE.liabilities === 0, "EMPTY_PROFILE 负债为 0");

// 2) isEmptyProfile 对空画像返回 true
assert(isEmptyProfile(null) === true, "isEmptyProfile(null) === true");
assert(isEmptyProfile(undefined) === true, "isEmptyProfile(undefined) === true");
assert(isEmptyProfile(EMPTY_PROFILE) === true, "isEmptyProfile(EMPTY_PROFILE) === true");

// 3) isEmptyProfile 对真实画像返回 false（哪怕只有一项非零）
const realWithSalary: FinancialProfile = {
  ...EMPTY_PROFILE,
  monthlySalary: 20000,
  goal: { retirementAge: 55, targetAmount: 5000000 },
};
assert(isEmptyProfile(realWithSalary) === false, "仅含月薪的真实画像 → 非空");

const realWithAsset: FinancialProfile = {
  ...EMPTY_PROFILE,
  cashSavings: 100000,
};
assert(isEmptyProfile(realWithAsset) === false, "仅含现金的真实画像 → 非空");

const realWithLiability: FinancialProfile = {
  ...EMPTY_PROFILE,
  liabilities: 500000,
};
assert(isEmptyProfile(realWithLiability) === false, "仅含负债的真实画像 → 非空");

// 4) 默认目标值不再硬编码 60/800 万（回归保护）
assert(EMPTY_PROFILE.goal.retirementAge !== 60, "回归保护：默认退休年龄已非 60");
assert(EMPTY_PROFILE.goal.targetAmount !== 8000000, "回归保护：默认目标金额已非 800 万");

console.log(failures === 0 ? "\nALL PASS ✅" : `\nFAILED ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
