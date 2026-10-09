import assert from "node:assert/strict";
import test from "node:test";

import { buildSampleWorkspace, isSampleId } from "../../src/lib/sample-workspace";

test("示例数据全部使用 SAMPLE- 前缀且结构完整", () => {
  const sample = buildSampleWorkspace(new Date("2026-01-01T00:00:00.000Z"));
  assert.ok(sample.cases.length && sample.documents.length && sample.risks.length && sample.rules.length && sample.tasks.length && sample.briefs.length);
  for (const list of [sample.cases, sample.documents, sample.risks, sample.rules, sample.tasks, sample.briefs]) {
    for (const item of list) assert.ok(isSampleId(item.id), `非示例 id: ${item.id}`);
  }
  assert.equal(sample.cases[0].id, "SAMPLE-CASE-1");
  assert.ok((sample.documents[0].factItems ?? []).every((fact) => isSampleId(fact.id)));
  assert.ok((sample.risks[0].factIds ?? []).every((id) => isSampleId(id)));
  assert.equal(sample.documents[0].caseId, sample.cases[0].id);
});

test("isSampleId 仅识别示例前缀", () => {
  assert.equal(isSampleId("SAMPLE-CASE-1"), true);
  assert.equal(isSampleId("CASE-ABC123"), false);
  assert.equal(isSampleId(undefined), false);
  assert.equal(isSampleId(""), false);
});
