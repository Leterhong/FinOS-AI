import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { extractPdfText } from "../../src/financial-data/parsers/pdf";

function pdfWithStream(content: Buffer | string): Buffer {
  const body = typeof content === "string" ? Buffer.from(content, "latin1") : content;
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nstream\n", "latin1"),
    body,
    Buffer.from("\nendstream\nendobj\n%%EOF", "latin1"),
  ]);
}

test("PDF parser extracts Tj and TJ text without backtracking regex", () => {
  const pdf = pdfWithStream(
    "BT (Enterprise \\(risk\\) review) Tj [(Cash) -80 ( flow)] TJ ET",
  );
  const result = extractPdfText(pdf);
  assert.match(result.text, /Enterprise \(risk\) review/);
  assert.match(result.text, /Cash flow/);
});

test("PDF parser handles FlateDecode-compatible streams", () => {
  const pdf = pdfWithStream(deflateSync(Buffer.from("BT (Quarterly report) Tj ET", "latin1")));
  assert.equal(extractPdfText(pdf).text, "Quarterly report");
});

test("PDF parser terminates safely on a large unterminated literal", () => {
  const adversarial = `BT (${"(".repeat(400_000)} ET`;
  const result = extractPdfText(pdfWithStream(adversarial));
  assert.equal(result.text, "");
  assert.ok(result.warnings.some((warning) => warning.includes("未能从 PDF 抽取")));
});
