import assert from "node:assert/strict";
import test from "node:test";
import { riskBand, scoreProject, scoreRisk } from "../../src/lib/risk-score";
import type { RiskSignal } from "../../src/types/enterprise";

function risk(overrides: Partial<RiskSignal> = {}): RiskSignal {
  return {
    id: "RISK-1",
    caseId: "CASE-1",
    company: "测试企业",
    title: "收入波动",
    level: "medium",
    evidence: "见事实 F-1",
    rule: "待复核",
    impact: "经营稳定性",
    status: "待核验",
    ...overrides,
  };
}

test("单条评分随等级升高且落在 0–100", () => {
  const low = scoreRisk(risk({ level: "low" }));
  const medium = scoreRisk(risk({ level: "medium" }));
  const high = scoreRisk(risk({ level: "high" }));
  const critical = scoreRisk(risk({ level: "critical" }));
  assert.ok(low < medium && medium < high && high < critical);
  for (const value of [low, medium, high, critical]) {
    assert.ok(value >= 0 && value <= 100);
  }
  assert.equal(riskBand(critical), "重大");
});

test("已缓释显著降低评分，关联事实与规则抬升评分", () => {
  const pending = scoreRisk(risk({ status: "待核验" }));
  const mitigated = scoreRisk(risk({ status: "已缓释" }));
  assert.ok(mitigated < pending);
  const plain = scoreRisk(risk({ ruleCodes: [], factIds: [] }));
  const linked = scoreRisk(risk({ ruleCodes: ["R-1"], factIds: ["F-1"] }));
  assert.ok(linked > plain);
});

test("项目评分以最高风险为主，空集返回 0", () => {
  const empty = scoreProject([]);
  assert.equal(empty.score, 0);
  assert.equal(empty.openCount, 0);
  const single = scoreProject([risk({ level: "high", status: "已确认" })]);
  const withCritical = scoreProject([
    risk({ id: "R-1", level: "low" }),
    risk({ id: "R-2", level: "critical", ruleCodes: ["R-1"], factIds: ["F-1"] }),
  ]);
  assert.ok(withCritical.maxScore > single.maxScore);
  assert.equal(withCritical.openCount, 2);
  const closed = scoreProject([risk({ status: "已缓释" })]);
  assert.equal(closed.openCount, 0);
});
