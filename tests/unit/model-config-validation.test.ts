import assert from "node:assert/strict";
import test from "node:test";

import {
  assertModelFieldLengths,
  MODEL_FIELD_MAX_LENGTHS,
  ModelConfigValidationError,
} from "../../src/ai/model-center/models/validation";

test("超过上限的字符串字段抛校验错误", () => {
  for (const field of Object.keys(MODEL_FIELD_MAX_LENGTHS) as (keyof typeof MODEL_FIELD_MAX_LENGTHS)[]) {
    const tooLong = "x".repeat(MODEL_FIELD_MAX_LENGTHS[field] + 1);
    assert.throws(
      () => assertModelFieldLengths({ [field]: tooLong }),
      ModelConfigValidationError,
      `${field} 超长应抛错`,
    );
  }
});

test("恰好等于上限的字符串通过", () => {
  assert.doesNotThrow(() =>
    assertModelFieldLengths({
      modelId: "x".repeat(MODEL_FIELD_MAX_LENGTHS.modelId),
      baseUrl: "y".repeat(MODEL_FIELD_MAX_LENGTHS.baseUrl),
    }),
  );
});

test("未提供或非字符串的字段被忽略", () => {
  assert.doesNotThrow(() =>
    assertModelFieldLengths({ displayName: undefined, modelName: 123, apiKey: { a: 1 } }),
  );
  assert.doesNotThrow(() => assertModelFieldLengths({}));
});
