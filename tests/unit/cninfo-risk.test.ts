import assert from "node:assert/strict";
import test from "node:test";

import { classifyAnnouncement, classifyAnnouncements } from "../../src/lib/cninfo-risk";

test("按关键词归类并给出等级", () => {
  assert.deepEqual(
    { category: classifyAnnouncement({ title: "关于公司涉及重大诉讼的公告" })?.category, level: classifyAnnouncement({ title: "关于公司涉及重大诉讼的公告" })?.level },
    { category: "诉讼与执行", level: "critical" },
  );
  assert.equal(classifyAnnouncement({ title: "关于股东部分股份质押的公告" })?.category, "股权质押");
  assert.equal(classifyAnnouncement({ title: "2025年度业绩预亏公告" })?.category, "业绩风险");
  assert.equal(classifyAnnouncement({ title: "关于商誉减值测试的公告" })?.category, "资产减值");
});

test("无风险关键词返回 null", () => {
  assert.equal(classifyAnnouncement({ title: "2025年半年度报告" }), null);
  assert.equal(classifyAnnouncement({ title: "" }), null);
});

test("批量归类按严重度排序且保留证据", () => {
  const result = classifyAnnouncements([
    { title: "关于股东减持计划的公告", date: "2026-01-02", pdf: "http://x/a.pdf" },
    { title: "关于公司被立案调查的公告", date: "2026-01-01", pdf: "http://x/b.pdf" },
    { title: "2025年年度报告", date: "2026-01-03" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].category, "合规风险");
  assert.equal(result[0].level, "high");
  assert.equal(result[1].category, "股东减持");
  assert.equal(result[0].pdf, "http://x/b.pdf");
});
