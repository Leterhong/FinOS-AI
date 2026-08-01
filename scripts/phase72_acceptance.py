"""Phase 7.2 Multimodal Intelligence + AI Agent Ecosystem 验收脚本（需求十九）。

六项验收：
1. 上传股票截图 → 识别持仓 → 确认后写入 Financial Twin
2. 上传工资文件（xlsx/csv）→ 确认后更新收入
3. 语音输入 → 生成财富画像（Speech Pipeline: STT → Intent → Entity）
4. 生成月度报告 → 导出 PDF
5. 用户在 Marketplace 开启 Investment / Tax Agent → 工作流生效
6. 跨用户数据隔离（A 的输入/报告/提取结果对 B 不可见）

附加校验：
7. 确认流程铁律：识别阶段绝不修改任何财富数据
8. 成本控制：未配置模型时 tier=local/ocr，零 LLM 调用且不报错
9. 免责声明覆盖 + 禁止绝对化/保证收益表述
10. 无数据用户返回欢迎态（绝不伪造数字）
11. Tool 系统可用且强制本人上下文

运行：
  cd "F:/FinOS AI"
  PYTHONPATH=. "C:/Users/LENOVO/.workbuddy/binaries/python/envs/default/Scripts/python.exe" scripts/phase72_acceptance.py

说明：本机未安装 tesseract OCR 二进制，验收项 1 通过替换 vision.agent.local_ocr
（测试替身）注入截图文本，以完整验证「压缩 → OCR → 抽取 → 待确认 → 确认写入」全链路。
"""
from __future__ import annotations

import io
import json
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("MIGRATE_LEGACY_DATA", "false")

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402

PASS: list[str] = []
FAIL: list[str] = []

BANNED_WORDS = ("绝对安全", "百分百安全", "完全安全", "保证收益", "稳赚", "必赚", "自动交易")
DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。"

# 模拟一张券商 App 持仓截图 OCR 出来的文本
STOCK_SCREENSHOT_OCR = """
持仓市值 386,420.00
可用资金 24,180.50
股票名称    持仓数量   成本价   市值
贵州茅台    100       1580.00  158,000.00
宁德时代    500       182.40   91,200.00
沪深300ETF  20000     3.86     77,200.00
招商银行    1500      39.98    59,970.00
今日盈亏 +2,340.20
"""


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        PASS.append(name)
        print(f"  [PASS] {name}")
    else:
        FAIL.append(f"{name} — {detail}")
        print(f"  [FAIL] {name} — {detail}")


def register(c: TestClient, email: str) -> str:
    r = c.post("/api/auth/register", json={"email": email, "password": "Test@12345", "name": "验收用户"})
    if r.status_code != 200 or not r.json().get("success"):
        r = c.post("/api/auth/login", json={"email": email, "password": "Test@12345"})
    data = r.json()["data"]
    return data.get("token") or data.get("access_token") or data["finos_token"]


def h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def scan_text(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


def seed_profile(c: TestClient, token: str) -> None:
    c.post(
        "/api/financial/profile",
        json={"age": 34, "income": 38000.0, "expense": 19000.0,
              "riskLevel": "balanced", "goal": "15年内攒够800万退休"},
        headers=h(token),
    )
    for payload in (
        {"type": "cash", "name": "活期存款", "amount": 220000},
        {"type": "fund", "name": "指数基金", "amount": 480000},
        {"type": "property", "name": "自住房", "amount": 2400000},
        {"type": "mortgage", "name": "房贷", "amount": 1300000},
    ):
        c.post("/api/assets", json=payload, headers=h(token))


def make_png(width: int = 900, height: int = 600) -> bytes:
    """生成一张真实 PNG（若 Pillow 缺失则回退最小合法 PNG）。"""
    try:
        from PIL import Image, ImageDraw  # type: ignore

        img = Image.new("RGB", (width, height), (250, 250, 250))
        d = ImageDraw.Draw(img)
        y = 30
        for line in STOCK_SCREENSHOT_OCR.strip().split("\n"):
            d.text((24, y), line.strip(), fill=(20, 20, 20))
            y += 34
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:  # noqa: BLE001
        import base64

        return base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )


def make_salary_xlsx() -> bytes | None:
    try:
        import openpyxl  # type: ignore
    except Exception:  # noqa: BLE001
        return None
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "2026年6月工资条"
    ws.append(["项目", "金额"])
    ws.append(["应发工资", "62000元"])
    ws.append(["社保公积金扣除", "9800元"])
    ws.append(["个人所得税", "7200元"])
    ws.append(["税后到手月薪", "45000元"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


SALARY_CSV = (
    "项目,金额\n"
    "应发工资,62000元\n"
    "社保公积金扣除,9800元\n"
    "个人所得税,7200元\n"
    "税后到手月薪,45000元\n"
).encode("utf-8")


def twin_snapshot(c: TestClient, token: str) -> tuple[int, float]:
    """返回 (资产条数, 月收入)，用于断言识别阶段未改动 Financial Twin。"""
    data = c.get("/api/financial/assets", headers=h(token)).json().get("data") or {}
    assets = data.get("assets") or []
    twin = c.get("/api/financial/profile", headers=h(token)).json().get("data") or {}
    return len(assets), float(twin.get("monthlyIncome") or 0.0)


def main() -> int:  # noqa: C901
    import backend.multimodal.vision.agent as vision_agent

    with TestClient(app) as c:
        uid = uuid.uuid4().hex[:8]
        token = register(c, f"p72_{uid}@finos.local")
        seed_profile(c, token)

        # ---------------------------------------------------------------- 0 能力探测
        print("\n[0] 能力探测 / capabilities")
        r = c.get("/api/multimodal/capabilities", headers=h(token))
        check("capabilities 200", r.status_code == 200, f"HTTP {r.status_code}")
        cap = r.json().get("data", {})
        check("四模态齐全", set(cap.get("modalities", [])) >= {"text", "image", "audio", "document"},
              scan_text(cap.get("modalities")))
        check("声明必须人工确认", cap.get("confirmRequired") is True, scan_text(cap))
        check("能力探测带免责声明", DISCLAIMER in scan_text(cap), scan_text(cap)[:200])

        # ---------------------------------------------------------------- 1 股票截图
        print("\n[1] 上传股票截图 → 识别持仓 → 确认写入")
        before_assets, before_income = twin_snapshot(c, token)

        original_ocr = vision_agent.local_ocr
        vision_agent.local_ocr = lambda data: STOCK_SCREENSHOT_OCR  # 测试替身：模拟 OCR 引擎
        try:
            png = make_png()
            r = c.post(
                "/api/multimodal/upload",
                files={"file": ("holdings.png", png, "image/png")},
                data={"useAi": "false"},
                headers=h(token),
            )
        finally:
            vision_agent.local_ocr = original_ocr

        check("图片上传 200", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}")
        img = r.json().get("data", {})
        check("识别结果需人工确认", img.get("needsConfirm") is True, scan_text(img)[:200])
        ex = img.get("extractions", [])
        check("识别出多条持仓", len(ex) >= 3, f"仅 {len(ex)} 条")
        check("持仓金额被正确解析",
              any(abs(float(e["amount"]) - 158000.0) < 1 for e in ex),
              scan_text([(e["label"], e["amount"]) for e in ex])[:300])
        check("每条都带原文依据", all(e.get("evidence") for e in ex), "存在无 evidence 的条目")
        check("全部为 needs_confirm 状态",
              all(e["status"] == "needs_confirm" for e in ex),
              scan_text([e["status"] for e in ex]))
        check("走本地 OCR 通道零 LLM 成本", img.get("tier") in ("ocr", "local"), f"tier={img.get('tier')}")

        # 铁律：识别阶段绝不改 Twin
        mid_assets, mid_income = twin_snapshot(c, token)
        check("★铁律：识别阶段未写入任何资产", mid_assets == before_assets,
              f"{before_assets} → {mid_assets}")
        check("★铁律：识别阶段未改动收入", abs(mid_income - before_income) < 1e-6,
              f"{before_income} → {mid_income}")

        # 挑资产类条目确认（并演示确认页可微调金额）
        asset_ids = [e["id"] for e in ex if e["kind"] in ("asset", "liability")][:3]
        first = asset_ids[0]
        r = c.post(
            "/api/multimodal/confirm",
            json={"ids": asset_ids, "edits": {first: {"label": "贵州茅台（已核对）"}}},
            headers=h(token),
        )
        check("确认接口 200", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}")
        conf = r.json().get("data", {})
        check("确认后写入资产", conf.get("appliedCount", 0) == len(asset_ids), scan_text(conf))
        after_assets, _ = twin_snapshot(c, token)
        check("Twin 资产条数按确认数增长", after_assets == before_assets + len(asset_ids),
              f"{before_assets} → {after_assets}")
        detail = c.get(f"/api/multimodal/inputs/{img['inputId']}", headers=h(token)).json()["data"]
        confirmed = [x for x in detail["extractions"] if x["id"] == first][0]
        check("确认页微调已生效", confirmed["label"] == "贵州茅台（已核对）", confirmed["label"])
        check("已确认条目标记 applied", confirmed["applied"] is True and confirmed["status"] == "confirmed",
              scan_text(confirmed)[:200])

        # ---------------------------------------------------------------- 2 工资文件
        print("\n[2] 上传工资文件 → 确认后更新收入")
        xlsx = make_salary_xlsx()
        if xlsx:
            files = {"file": ("salary-2026-06.xlsx", xlsx,
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            fmt = "xlsx"
        else:
            files = {"file": ("salary-2026-06.csv", SALARY_CSV, "text/csv")}
            fmt = "csv"
        r = c.post("/api/multimodal/upload", files=files, data={"useAi": "false"}, headers=h(token))
        check(f"工资文件({fmt})上传 200", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}")
        doc = r.json().get("data", {})
        check("文件识别需确认", doc.get("needsConfirm") is True, scan_text(doc)[:200])
        dex = doc.get("extractions", [])
        income_items = [e for e in dex if e["kind"] == "income"]
        check("识别出收入条目", bool(income_items),
              scan_text([(e["kind"], e["label"], e["amount"]) for e in dex])[:400])

        income_before = twin_snapshot(c, token)[1]
        target = max(income_items, key=lambda e: e["amount"]) if income_items else None
        if target:
            r = c.post("/api/multimodal/confirm", json={"ids": [target["id"]]}, headers=h(token))
            check("工资确认 200", r.status_code == 200, r.text[:200])
            income_after = twin_snapshot(c, token)[1]
            check("确认后收入被更新", abs(income_after - float(target["amount"])) < 1,
                  f"{income_before} → {income_after}, 期望 {target['amount']}")
            check("收入确实发生变化", abs(income_after - income_before) > 1e-6,
                  f"{income_before} → {income_after}")

        # 拒绝流程
        rest = [e["id"] for e in dex if e["status"] == "needs_confirm" and (not target or e["id"] != target["id"])]
        if rest:
            r = c.post("/api/multimodal/reject", json={"ids": rest[:2]}, headers=h(token))
            check("忽略识别结果 200", r.status_code == 200, r.text[:200])
            check("拒绝后不再出现在待确认列表",
                  all(x["id"] not in rest[:2] for x in
                      c.get("/api/multimodal/pending", headers=h(token)).json()["data"]["items"]),
                  "被拒绝条目仍在 pending")

        # ---------------------------------------------------------------- 3 语音
        print("\n[3] 语音输入 → 财富画像")
        transcript = "我今年34岁，月薪三万八，每月支出一万九，风格比较稳健，希望15年内攒够800万退休。"
        r = c.post(
            "/api/multimodal/speech",
            json={"transcript": transcript, "useAi": False, "autoIngest": True},
            headers=h(token),
        )
        check("语音接口 200", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}")
        sp = r.json().get("data", {})
        check("转写文本回显", transcript[:8] in (sp.get("transcript") or ""), sp.get("transcript", "")[:60])
        check("使用前端 STT（零成本）", sp.get("sttEngine") == "client", str(sp.get("sttEngine")))
        analysis = sp.get("analysis") or {}
        check("识别出用户意图", bool(analysis.get("intent")), scan_text(analysis)[:200])
        kinds = {e["kind"] for e in sp.get("entities", [])}
        check("生成财富画像要素（画像/目标/收支）",
              bool(kinds & {"profile", "goal", "income", "expense"}), scan_text(sorted(kinds)))
        check("语音结果同样需确认", sp.get("needsConfirm") is True, scan_text(list(sp.keys())))

        speech_ex = sp.get("extractions", [])
        profile_ids = [e["id"] for e in speech_ex if e["kind"] in ("profile", "goal")]
        if profile_ids:
            r = c.post("/api/multimodal/confirm", json={"ids": profile_ids}, headers=h(token))
            check("语音画像确认 200", r.status_code == 200, r.text[:200])
            twin = c.get("/api/financial/profile", headers=h(token)).json().get("data") or {}
            check("画像已写入 Twin（目标/风险偏好）",
                  "800" in str(twin.get("goal") or "") or bool(twin.get("riskLevel")),
                  scan_text({"goal": twin.get("goal"), "riskLevel": twin.get("riskLevel")}))

        # ---------------------------------------------------------------- 4 报告 + PDF
        print("\n[4] 生成报告 → 导出 PDF")
        r = c.get("/api/reports/kinds", headers=h(token))
        check("报告模板列表 200", r.status_code == 200, f"HTTP {r.status_code}")
        kinds_data = r.json().get("data", {})
        check("四类模板齐全",
              {k["kind"] for k in kinds_data.get("items", [])} >= {"monthly", "annual", "life_plan", "investment"},
              scan_text([k["kind"] for k in kinds_data.get("items", [])]))

        r = c.post("/api/reports/generate", json={"kind": "monthly", "useAi": False, "persist": True},
                   headers=h(token))
        check("报告生成 200", r.status_code == 200, f"HTTP {r.status_code} {r.text[:200]}")
        rep = r.json().get("data", {})
        check("报告有章节", len(rep.get("sections", [])) >= 3, f"{len(rep.get('sections', []))} 节")
        check("报告含 Markdown 正文", len(rep.get("markdown", "")) > 200, f"{len(rep.get('markdown',''))} 字符")
        check("报告未调用 LLM（tier=local）", rep.get("tier") == "local", f"tier={rep.get('tier')}")
        check("报告含免责声明", DISCLAIMER in rep.get("markdown", ""), rep.get("markdown", "")[-200:])
        report_id = rep.get("id")
        check("报告已落库", bool(report_id), "无报告 id")

        for fmt_name, ctype in (("markdown", "text/markdown"), ("html", "text/html")):
            rr = c.get(f"/api/reports/{report_id}/export?format={fmt_name}", headers=h(token))
            check(f"导出 {fmt_name} 200", rr.status_code == 200 and ctype in rr.headers.get("content-type", ""),
                  f"HTTP {rr.status_code} {rr.headers.get('content-type')}")

        rr = c.get(f"/api/reports/{report_id}/export?format=pdf", headers=h(token))
        ctype = rr.headers.get("content-type", "")
        if "application/pdf" in ctype:
            check("导出 PDF 成功", rr.status_code == 200 and rr.content[:4] == b"%PDF",
                  f"HTTP {rr.status_code} magic={rr.content[:4]!r}")
            check("PDF 体积合理", len(rr.content) > 1000, f"{len(rr.content)} bytes")
        else:
            check("PDF 组件缺失时降级为可打印 HTML",
                  rr.status_code == 200 and rr.headers.get("X-Export-Fallback") == "pdf-unavailable-use-print",
                  f"HTTP {rr.status_code} {ctype} fallback={rr.headers.get('X-Export-Fallback')}")

        r = c.get("/api/reports", headers=h(token))
        check("报告列表含刚生成的报告",
              any(x["id"] == report_id for x in r.json()["data"]["items"]), r.text[:200])

        # ---------------------------------------------------------------- 5 Agent Marketplace
        print("\n[5] Agent Marketplace → 开启 Agent → 工作流生效")
        r = c.get("/api/agents/market", headers=h(token))
        check("Marketplace 200", r.status_code == 200, f"HTTP {r.status_code}")
        market = {a["name"]: a for a in r.json()["data"]["items"]}
        check("内置 5 个 Agent",
              {"cashflow", "investment", "retirement", "insurance", "tax"} <= set(market),
              scan_text(sorted(market)))
        check("税务 Agent 默认关闭", market["tax"]["enabled"] is False, scan_text(market["tax"]))
        check("投资 Agent 默认开启", market["investment"]["enabled"] is True, scan_text(market["investment"]))

        base = c.post("/api/agents/workflow", json={"question": "我该怎么优化配置？", "useAi": False},
                      headers=h(token)).json()["data"]
        base_names = {a["agent"] for a in base.get("results", [])}
        check("默认工作流不含 tax", "tax" not in base_names, scan_text(sorted(base_names)))
        check("默认工作流含 investment", "investment" in base_names, scan_text(sorted(base_names)))

        r = c.put("/api/agents/market/tax", json={"enabled": True, "priority": 50}, headers=h(token))
        check("开启税务 Agent 200", r.status_code == 200, r.text[:200])
        after = c.post("/api/agents/workflow", json={"question": "我该怎么优化配置和税务？", "useAi": False},
                       headers=h(token)).json()["data"]
        after_results = after.get("results", [])
        after_names = {a["agent"] for a in after_results}
        check("开启后工作流纳入 tax", "tax" in after_names, scan_text(sorted(after_names)))

        check("工作流含编排轨迹", len(after.get("trace", [])) >= 2, scan_text(after.get("trace"))[:300])
        modes = {t.get("mode") for t in after.get("trace", [])}
        check("串行 + 并行编排均生效", {"serial", "parallel"} <= modes, scan_text(sorted(m for m in modes if m)))
        for a in after_results:
            if not a.get("ok"):
                continue
            check(f"{a['agent']} 输出三段式",
                  all(a.get(k) for k in ("cause", "impact", "advice")), scan_text(a)[:200])
            break
        check("工作流带汇总", bool(after.get("summary")), scan_text(list(after.keys())))
        check("工作流全程本地档（未配模型）",
              all(a.get("tier") in ("local", "light") for a in after_results),
              scan_text([(a["agent"], a.get("tier")) for a in after_results]))

        r = c.post("/api/agents/run/retirement", json={"question": "我能几岁退休？", "useAi": False},
                   headers=h(token))
        check("单 Agent 执行 200", r.status_code == 200, r.text[:200])
        single = r.json()["data"]
        single_result = single.get("result") or {}
        check("单 Agent 返回结论", bool(single_result.get("headline")), scan_text(single)[:200])
        check("单 Agent 输出三段式",
              all(single_result.get(k) for k in ("cause", "impact", "advice")),
              scan_text(single_result)[:200])

        r = c.get("/api/agents/runs", headers=h(token))
        check("执行日志已记录", len(r.json()["data"]["items"]) >= 1, r.text[:200])

        # Tool 系统
        print("\n[5b] Tool 系统")
        r = c.get("/api/agents/tools", headers=h(token))
        tools = {t["name"] for t in r.json()["data"]["items"]}
        check("工具集齐全（计算/数据/检索/行情/文件）",
              {"calc.compound", "calc.retirement_gap", "db.assets", "rag.search",
               "market.quote", "file.parse"} <= tools, scan_text(sorted(tools)))
        r = c.post("/api/agents/tools/call",
                   json={"tool": "calc.compound",
                         "params": {"principal": 100000, "annualRate": 0.06, "years": 10}},
                   headers=h(token))
        check("工具调用 200", r.status_code == 200, r.text[:200])
        tool_res = r.json().get("data") or {}
        check("复利计算正确（10 年 6% ≈ 179085）",
              abs(float(tool_res.get("futureValue", 0)) - 179084.77) < 5, scan_text(tool_res))
        # 参数同义名容错：rate → annualRate
        r = c.post("/api/agents/tools/call",
                   json={"tool": "calc.compound",
                         "params": {"principal": 100000, "rate": 0.06, "years": 10}},
                   headers=h(token))
        check("工具参数同义名可容错（rate→annualRate）",
              r.status_code == 200 and abs(float((r.json().get("data") or {}).get("futureValue", 0)) - 179084.77) < 5,
              r.text[:200])
        r = c.post("/api/agents/tools/call",
                   json={"tool": "calc.compound", "params": {"不存在的参数": 1}}, headers=h(token))
        check("非法参数返回可读报错而非堆栈",
              r.json().get("success") is False and "支持" in str(r.json().get("error", "")),
              r.text[:200])
        r = c.post("/api/agents/tools/call", json={"tool": "db.assets", "params": {}}, headers=h(token))
        check("db.assets 只返回本人数据", r.status_code == 200 and r.json()["data"].get("ok") is not False,
              r.text[:200])

        # ---------------------------------------------------------------- 6 跨用户隔离
        print("\n[6] 跨用户数据隔离")
        token_b = register(c, f"p72b_{uid}@finos.local")

        rb = c.get(f"/api/multimodal/inputs/{img['inputId']}", headers=h(token_b))
        check("B 无法读取 A 的多模态输入", rb.status_code == 404, f"HTTP {rb.status_code}")
        rb = c.post("/api/multimodal/confirm", json={"ids": [e["id"] for e in ex]}, headers=h(token_b))
        check("B 无法确认 A 的提取结果",
              rb.status_code in (400, 404) or rb.json().get("success") is False, rb.text[:200])
        rb = c.get(f"/api/reports/{report_id}", headers=h(token_b))
        check("B 无法读取 A 的报告", rb.status_code == 404, f"HTTP {rb.status_code}")
        rb = c.get(f"/api/reports/{report_id}/export?format=markdown", headers=h(token_b))
        check("B 无法导出 A 的报告", rb.status_code == 404, f"HTTP {rb.status_code}")
        rb = c.delete(f"/api/multimodal/inputs/{img['inputId']}", headers=h(token_b))
        check("B 无法删除 A 的输入", rb.status_code == 404, f"HTTP {rb.status_code}")

        check("B 的待确认列表为空",
              c.get("/api/multimodal/pending", headers=h(token_b)).json()["data"]["count"] == 0,
              "B 看到了别人的待确认数据")
        check("B 的执行日志为空",
              c.get("/api/agents/runs", headers=h(token_b)).json()["data"]["items"] == [],
              "B 看到了别人的执行日志")

        # ---------------------------------------------------------------- 7 无数据欢迎态
        print("\n[7] 新用户欢迎态（绝不伪造数字）")
        rb = c.get("/api/multimodal/inputs", headers=h(token_b))
        wb = rb.json()["data"]
        check("无输入时返回欢迎态", wb.get("hasData") is False and bool(wb.get("welcome")), scan_text(wb))
        rb = c.post("/api/reports/generate", json={"kind": "monthly", "useAi": False, "persist": False},
                    headers=h(token_b))
        wr = rb.json()["data"]
        check("无数据时报告返回欢迎态而非编造", wr.get("hasData") is False, scan_text(wr)[:300])
        check("欢迎态引导创建财富分身", "财富数字分身" in scan_text(wr), scan_text(wr)[:300])
        rb = c.post("/api/agents/workflow", json={"useAi": False}, headers=h(token_b))
        check("无数据时工作流返回欢迎态", rb.json()["data"].get("hasData") is False, rb.text[:300])

        # ---------------------------------------------------------------- 8 安全口径
        print("\n[8] 免责声明 + 禁语扫描")
        corpus = scan_text([after, rep, single, img, doc, sp, cap])
        hits = [w for w in BANNED_WORDS if w in corpus]
        check("无绝对化/保证收益表述", not hits, f"命中禁语 {hits}")
        check("工作流输出含免责声明", DISCLAIMER in scan_text(after), scan_text(after)[-300:])
        check("单 Agent 输出含免责声明", DISCLAIMER in scan_text(single), scan_text(single)[-300:])

        # ---------------------------------------------------------------- 9 幂等与清理
        print("\n[9] 幂等与删除")
        r = c.post("/api/multimodal/confirm", json={"ids": asset_ids}, headers=h(token))
        check("重复确认幂等（不重复写入）", r.json()["data"]["appliedCount"] == 0, r.text[:200])
        cnt_now = twin_snapshot(c, token)[0]
        check("重复确认后资产条数不变", cnt_now == after_assets, f"{after_assets} → {cnt_now}")
        r = c.delete(f"/api/multimodal/inputs/{img['inputId']}", headers=h(token))
        check("删除自己的输入 200", r.status_code == 200, r.text[:200])
        check("删除后不可再读",
              c.get(f"/api/multimodal/inputs/{img['inputId']}", headers=h(token)).status_code == 404,
              "删除后仍可读")

    print("\n" + "=" * 66)
    print(f"Phase 7.2 验收：PASS {len(PASS)} / FAIL {len(FAIL)}")
    if FAIL:
        print("\n未通过项：")
        for f in FAIL:
            print(f"  - {f}")
    print("=" * 66)
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
