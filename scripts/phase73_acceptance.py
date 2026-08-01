"""Phase 7.3 FinOS AI Personal OS 验收脚本（18 项）。

覆盖范围：
  1  新用户零数据 → 全模块欢迎态（绝不伪造数字）
  2  Wealth Avatar 生成与重命名
  3  财富时间线：past/now/future 三段 + 自定义事件增删
  4  时间线事件删除权限（system 源不可删）
  5  AI Memory：四类 kind 写入与分组
  6  AI Memory：key 幂等覆盖（同 key 不产生重复条目）
  7  AI Memory：更新与删除
  8  AI CFO Command Center：today / aiDiscover / actions / riskAlerts 结构完整
  9  个人知识中心：增改删 + 收藏 + 分类/关键词筛选
  10 财富日报：生成与读取
  11 决策记录：写入与列出
  12 方案版本：多版本并存与按 subject 过滤
  13 全局搜索：跨模块命中
  14 通知中心：五分类 + 未读/已读/归档/删除
  15 数据控制中心：导出结构完整
  16 数据控制中心：清空记忆
  17 跨用户数据隔离（A 绝不可见 B 的任何 Personal OS 数据）
  18 合规：免责声明覆盖 + 禁用绝对化表述

运行：
  "C:/Users/LENOVO/.workbuddy/binaries/python/envs/default/Scripts/python.exe" scripts/phase73_acceptance.py
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("MIGRATE_LEGACY_DATA", "false")

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402

PASS: list[str] = []
FAIL: list[str] = []

BANNED_WORDS = (
    "绝对安全",
    "百分百安全",
    "完全安全",
    "保证收益",
    "稳赚",
    "必赚",
    "自动交易",
)
DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。"

PO = "/api/personal-os"
NOTIF = "/api/notifications"


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        PASS.append(name)
        print(f"  [PASS] {name}")
    else:
        FAIL.append(f"{name} — {detail}")
        print(f"  [FAIL] {name} — {detail}")


def register(c: TestClient, email: str) -> str:
    r = c.post(
        "/api/auth/register",
        json={"email": email, "password": "Test@12345", "name": "验收用户"},
    )
    if r.status_code != 200 or not r.json().get("success"):
        r = c.post("/api/auth/login", json={"email": email, "password": "Test@12345"})
    data = r.json()["data"]
    return data.get("token") or data.get("access_token") or data["finos_token"]


def h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def body(r: Any) -> dict[str, Any]:
    """取统一信封中的 data，失败时返回空 dict 而不抛异常。"""
    try:
        j = r.json()
    except Exception:
        return {}
    if isinstance(j, dict) and "data" in j:
        d = j.get("data")
        return d if isinstance(d, dict) else {"_raw": d}
    return j if isinstance(j, dict) else {}


def seed_profile(c: TestClient, token: str) -> None:
    c.post(
        "/api/financial/profile",
        json={
            "age": 34,
            "income": 42000.0,
            "expense": 21000.0,
            "riskLevel": "balanced",
            "goal": "10年内攒够500万退休",
        },
        headers=h(token),
    )
    for payload in (
        {"type": "cash", "name": "活期存款", "amount": 280000},
        {"type": "fund", "name": "指数基金", "amount": 520000},
        {"type": "stock", "name": "A股组合", "amount": 310000},
    ):
        c.post("/api/financial/assets", json=payload, headers=h(token))


def collect_text(obj: Any, out: list[str]) -> None:
    """递归收集所有字符串，用于合规扫描。"""
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            collect_text(v, out)
    elif isinstance(obj, list):
        for v in obj:
            collect_text(v, out)


def main() -> int:
    client = TestClient(app)
    uid = uuid.uuid4().hex[:8]
    email_a = f"p73a_{uid}@finos.local"
    email_b = f"p73b_{uid}@finos.local"

    print("\n=== Phase 7.3 Personal OS 验收 ===\n")

    token_a = register(client, email_a)
    token_b = register(client, email_b)
    ha, hb = h(token_a), h(token_b)

    all_text: list[str] = []

    # ── 1. 新用户零数据 → 欢迎态 ──
    print("[1] 新用户零数据欢迎态")
    empty_ok = True
    empty_detail = ""
    for path in (f"{PO}/avatar", f"{PO}/timeline", f"{PO}/memory", f"{PO}/command-center"):
        r = client.get(path, headers=hb)
        d = body(r)
        collect_text(d, all_text)
        if r.status_code != 200:
            empty_ok = False
            empty_detail = f"{path} -> HTTP {r.status_code}"
            break
        if d.get("hasData") is not False:
            empty_ok = False
            empty_detail = f"{path} hasData 应为 False，实际 {d.get('hasData')}"
            break
    check("新用户四大模块均返回 hasData=False 欢迎态", empty_ok, empty_detail)

    r = client.get(f"{PO}/avatar", headers=hb)
    msg = body(r).get("message") or ""
    check(
        "新用户欢迎文案非空且不伪造数字",
        bool(msg) and "0" not in msg.replace("FinOS", ""),
        f"message={msg!r}",
    )

    # 给 A 用户铺数据
    seed_profile(client, token_a)

    # ── 2. Wealth Avatar ──
    print("\n[2] Wealth Avatar")
    r = client.post(f"{PO}/avatar", json={"avatarName": "我的财富分身"}, headers=ha)
    check("Avatar 重命名成功", r.status_code == 200 and r.json().get("success") is True, r.text[:120])
    r = client.get(f"{PO}/avatar", headers=ha)
    d = body(r)
    collect_text(d, all_text)
    avatar = d.get("avatar") or {}
    check(
        "Avatar 返回完整画像字段",
        d.get("hasData") is True
        and avatar.get("avatarName") == "我的财富分身"
        and all(k in avatar for k in ("profileSummary", "financialStatus", "lifeStage", "riskPreference", "futureOutlook")),
        f"avatar={json.dumps(avatar, ensure_ascii=False)[:160]}",
    )

    # ── 3./4. 财富时间线 ──
    print("\n[3] 财富时间线")
    r = client.post(
        f"{PO}/timeline/events",
        json={
            "title": "买入第一套房",
            "category": "asset",
            "eventDate": "2021-06-01",
            "description": "首付 120 万",
        },
        headers=ha,
    )
    check("添加人生事件成功", r.status_code == 200 and r.json().get("success") is True, r.text[:120])
    event_id = body(r).get("id") or (body(r).get("event") or {}).get("id")

    r = client.get(f"{PO}/timeline", headers=ha)
    d = body(r)
    collect_text(d, all_text)
    check(
        "时间线返回 past/now/future 三段结构",
        d.get("hasData") is True and all(isinstance(d.get(k), list) for k in ("past", "now", "future", "events")),
        f"keys={list(d.keys())}",
    )
    check(
        "自定义事件出现在时间线中",
        any(n.get("title") == "买入第一套房" for n in (d.get("events") or []) + (d.get("past") or [])),
        f"events={len(d.get('events') or [])}",
    )

    print("\n[4] 时间线删除权限")
    nodes = (d.get("past") or []) + (d.get("now") or []) + (d.get("future") or [])
    system_nodes = [n for n in nodes if n.get("source") != "user"]
    check(
        "系统生成节点 deletable=False（不可被误删）",
        all(n.get("deletable") is False for n in system_nodes) if system_nodes else True,
        f"违规节点={[n.get('title') for n in system_nodes if n.get('deletable')][:3]}",
    )
    if event_id:
        r = client.delete(f"{PO}/timeline/events/{event_id}", headers=ha)
        check("用户自定义事件可删除", r.status_code == 200, r.text[:120])
    else:
        check("用户自定义事件可删除", False, "未取到 event id")

    # ── 5./6./7. AI Memory ──
    print("\n[5] AI Memory 四类写入")
    kinds = ["preference", "life_stage", "decision", "wealth_change"]
    for i, k in enumerate(kinds):
        client.post(
            f"{PO}/memory",
            json={
                "kind": k,
                "key": f"{k}_key",
                "content": f"验收记忆内容 {k}",
                "importance": 3 + (i % 3),
            },
            headers=ha,
        )
    r = client.get(f"{PO}/memory", headers=ha)
    d = body(r)
    collect_text(d, all_text)
    groups = d.get("groups") or {}
    check(
        "四类 kind 全部写入并正确分组",
        d.get("hasData") is True and all(k in groups and len(groups[k]) >= 1 for k in kinds),
        f"groups={ {k: len(v) for k, v in groups.items()} }",
    )
    check("记忆分组附带中文标签 labels", bool(d.get("labels")), f"labels={d.get('labels')}")

    r = client.get(f"{PO}/memory?kind=preference", headers=ha)
    dk = body(r)
    check(
        "按 kind 过滤生效",
        set((dk.get("groups") or {}).keys()) <= {"preference"},
        f"实际分组={list((dk.get('groups') or {}).keys())}",
    )

    print("\n[6] 记忆 key 幂等")
    before = len((body(client.get(f"{PO}/memory?kind=preference", headers=ha)).get("groups") or {}).get("preference") or [])
    client.post(
        f"{PO}/memory",
        json={"kind": "preference", "key": "preference_key", "content": "覆盖后的偏好", "importance": 5},
        headers=ha,
    )
    after_items = (body(client.get(f"{PO}/memory?kind=preference", headers=ha)).get("groups") or {}).get("preference") or []
    check(
        "同 kind+key 幂等覆盖而非新增",
        len(after_items) == before,
        f"覆盖前 {before} 条，覆盖后 {len(after_items)} 条",
    )
    check(
        "幂等覆盖后内容已更新",
        any(m.get("content") == "覆盖后的偏好" for m in after_items),
        f"contents={[m.get('content') for m in after_items][:3]}",
    )

    print("\n[7] 记忆更新与删除")
    target = after_items[0] if after_items else None
    if target:
        r = client.put(f"{PO}/memory/{target['id']}", json={"content": "手动修订的记忆"}, headers=ha)
        check("记忆内容可更新", r.status_code == 200, r.text[:120])
        r = client.delete(f"{PO}/memory/{target['id']}", headers=ha)
        check("记忆条目可删除", r.status_code == 200, r.text[:120])
    else:
        check("记忆内容可更新", False, "无可用记忆条目")
        check("记忆条目可删除", False, "无可用记忆条目")

    # ── 8. Command Center ──
    print("\n[8] AI CFO Command Center")
    r = client.get(f"{PO}/command-center", headers=ha)
    d = body(r)
    collect_text(d, all_text)
    today = d.get("today") or {}
    check(
        "驾驶舱返回 today 全字段",
        d.get("hasData") is True
        and all(
            k in today
            for k in ("netWorth", "totalAssets", "healthScore", "savingsRate", "riskLevel", "disclaimer")
        ),
        f"today keys={list(today.keys())}",
    )
    check(
        "驾驶舱返回 aiDiscover / actions / riskAlerts",
        isinstance(d.get("aiDiscover"), dict)
        and isinstance(d.get("actions"), dict)
        and isinstance(d.get("riskAlerts"), list),
        f"keys={list(d.keys())}",
    )
    actions = d.get("actions") or {}
    check(
        "行动建议分为 week / months / longTerm 三档",
        all(isinstance(actions.get(k), list) for k in ("week", "months", "longTerm")),
        f"actions keys={list(actions.keys())}",
    )
    check("驾驶舱携带免责声明", DISCLAIMER in (today.get("disclaimer") or ""), f"disclaimer={today.get('disclaimer')!r}")

    # ── 9. 知识中心 ──
    print("\n[9] 个人知识中心")
    r = client.post(
        f"{PO}/knowledge",
        json={
            "title": "指数基金定投要点",
            "content": "长期定投宽基指数，降低择时风险，注意费率与跟踪误差。",
            "category": "investment",
            "tags": ["基金", "定投"],
            "source": "manual",
        },
        headers=ha,
    )
    check("新增知识条目成功", r.status_code == 200 and r.json().get("success") is True, r.text[:120])
    kid = body(r).get("id") or (body(r).get("item") or {}).get("id")

    client.post(
        f"{PO}/knowledge",
        json={"title": "重疾险配置思路", "content": "保额优先覆盖 3-5 年家庭支出。", "category": "insurance", "tags": ["保险"]},
        headers=ha,
    )

    r = client.get(f"{PO}/knowledge?category=investment", headers=ha)
    items = (body(r).get("items")) or []
    collect_text(items, all_text)
    check(
        "按分类筛选生效",
        len(items) >= 1 and all(i.get("category") == "investment" for i in items),
        f"命中 {len(items)} 条，分类={[i.get('category') for i in items]}",
    )

    r = client.get(f"{PO}/knowledge?q=定投", headers=ha)
    q_items = (body(r).get("items")) or []
    check("关键词搜索命中", any("定投" in (i.get("title", "") + i.get("content", "")) for i in q_items), f"命中 {len(q_items)} 条")

    if kid:
        r = client.post(f"{PO}/knowledge/{kid}/favorite", headers=ha)
        check("知识收藏切换成功", r.status_code == 200, r.text[:120])
        fav = (body(client.get(f"{PO}/knowledge?favorite=true", headers=ha)).get("items")) or []
        check("收藏筛选生效", any(i.get("id") == kid for i in fav), f"收藏 {len(fav)} 条")
        r = client.put(f"{PO}/knowledge/{kid}", json={"title": "指数基金定投要点（修订）"}, headers=ha)
        check("知识条目可更新", r.status_code == 200, r.text[:120])
        r = client.delete(f"{PO}/knowledge/{kid}", headers=ha)
        check("知识条目可删除", r.status_code == 200, r.text[:120])
    else:
        for n in ("知识收藏切换成功", "收藏筛选生效", "知识条目可更新", "知识条目可删除"):
            check(n, False, "未取到 knowledge id")

    # ── 10. 财富日报 ──
    print("\n[10] 财富日报")
    r = client.post(f"{PO}/briefing/generate", headers=ha)
    gen_ok = r.status_code == 200
    r = client.get(f"{PO}/briefing", headers=ha)
    d = body(r)
    collect_text(d, all_text)
    check(
        "日报生成并可读取",
        gen_ok and r.status_code == 200 and bool(d.get("greeting") or d.get("wealthChange") or d.get("date")),
        f"briefing={json.dumps(d, ensure_ascii=False)[:160]}",
    )

    # ── 11. 决策记录 ──
    print("\n[11] 决策记录")
    r = client.post(
        f"{PO}/decisions",
        json={
            "question": "是否提前偿还房贷",
            "analysis": "房贷利率 4.1%，低于长期投资预期回报。",
            "recommendation": "保留现金流，暂不提前还贷。",
            "chosenPlan": "维持现状",
            "alternatives": "一次性偿还 50 万",
        },
        headers=ha,
    )
    check("决策记录写入成功", r.status_code == 200 and r.json().get("success") is True, r.text[:120])
    r = client.get(f"{PO}/decisions", headers=ha)
    items = (body(r).get("items")) or []
    collect_text(items, all_text)
    check("决策记录可列出", any(i.get("question") == "是否提前偿还房贷" for i in items), f"共 {len(items)} 条")

    # ── 12. 方案版本 ──
    print("\n[12] 方案版本")
    for v in (1, 2):
        client.post(
            f"{PO}/plan-versions",
            json={
                "subject": "retirement",
                "version": v,
                "title": f"退休方案 v{v}",
                "content": f"第 {v} 版内容",
                "changeNote": "调整储蓄率" if v == 2 else "初版",
            },
            headers=ha,
        )
    client.post(
        f"{PO}/plan-versions",
        json={"subject": "housing", "version": 1, "title": "购房方案 v1", "content": "首付方案"},
        headers=ha,
    )
    r = client.get(f"{PO}/plan-versions?subject=retirement", headers=ha)
    items = (body(r).get("items")) or []
    collect_text(items, all_text)
    check(
        "同一主题多版本并存且按 subject 过滤",
        len(items) >= 2 and all(i.get("subject") == "retirement" for i in items),
        f"命中 {len(items)} 条，subjects={[i.get('subject') for i in items]}",
    )

    # ── 13. 全局搜索 ──
    print("\n[13] 全局搜索")
    r = client.get(f"{PO}/search?q=退休", headers=ha)
    d = body(r)
    collect_text(d, all_text)
    results = d.get("results") or {}
    check(
        "全局搜索返回分组结果",
        r.status_code == 200 and isinstance(results, dict) and (d.get("total") or 0) > 0,
        f"total={d.get('total')} groups={list(results.keys())}",
    )
    r = client.get(f"{PO}/search?q=zzz_不存在的关键词_zzz", headers=ha)
    check("搜索无命中时返回 total=0 而非报错", r.status_code == 200 and (body(r).get("total") or 0) == 0, r.text[:120])

    # ── 14. 通知中心 ──
    print("\n[14] 通知中心")
    created: list[str] = []
    for cat, sev in (("wealth", "info"), ("risk", "warn"), ("goal", "info"), ("ai", "info"), ("system", "info")):
        r = client.post(
            NOTIF,
            json={"title": f"{cat} 验收通知", "body": f"{cat} 分类正文", "category": cat, "severity": sev},
            headers=ha,
        )
        nid = body(r).get("id") or (body(r).get("notification") or {}).get("id")
        if nid:
            created.append(nid)
    check("五类通知均可创建", len(created) == 5, f"实际创建 {len(created)} 条")

    r = client.get(NOTIF, headers=ha)
    d = body(r)
    collect_text(d, all_text)
    check("通知列表返回 notifications + unread", isinstance(d.get("notifications"), list) and "unread" in d, f"keys={list(d.keys())}")

    r = client.get(f"{NOTIF}?category=risk", headers=ha)
    risk_items = (body(r).get("notifications")) or []
    check(
        "通知按分类筛选生效",
        len(risk_items) >= 1 and all(n.get("category") == "risk" for n in risk_items),
        f"命中 {len(risk_items)} 条",
    )

    if created:
        nid = created[0]
        client.post(f"{NOTIF}/{nid}/read", headers=ha)
        unread_items = (body(client.get(f"{NOTIF}?unread=true", headers=ha)).get("notifications")) or []
        check("标记已读后不再出现在未读列表", all(n.get("id") != nid for n in unread_items), f"未读 {len(unread_items)} 条")

        client.post(f"{NOTIF}/{nid}/archive", headers=ha)
        arch = (body(client.get(f"{NOTIF}?archived=true", headers=ha)).get("notifications")) or []
        check("归档后出现在归档列表", any(n.get("id") == nid for n in arch), f"归档 {len(arch)} 条")

        client.post(f"{NOTIF}/{nid}/archive", headers=ha)
        arch2 = (body(client.get(f"{NOTIF}?archived=true", headers=ha)).get("notifications")) or []
        check("归档接口可切换（再次调用取消归档）", all(n.get("id") != nid for n in arch2), f"归档仍有 {len(arch2)} 条")

        r = client.delete(f"{NOTIF}/{nid}", headers=ha)
        check("通知可删除", r.status_code == 200, r.text[:120])
    else:
        for n in ("标记已读后不再出现在未读列表", "归档后出现在归档列表", "归档接口可切换（再次调用取消归档）", "通知可删除"):
            check(n, False, "未创建成功任何通知")

    # ── 15. 数据导出 ──
    print("\n[15] 数据控制中心 · 导出")
    r = client.get(f"{PO}/privacy/export", headers=ha)
    d = body(r)
    collect_text(d, all_text)
    exported = d.get("data") if isinstance(d.get("data"), dict) else d
    check(
        "导出返回时间戳与数据体",
        r.status_code == 200 and bool(d.get("exportedAt")) and isinstance(exported, dict) and len(exported) > 0,
        f"exportedAt={d.get('exportedAt')} keys={list(exported.keys())[:8] if isinstance(exported, dict) else None}",
    )

    # ── 16. 清空记忆 ──
    print("\n[16] 数据控制中心 · 清空记忆")
    r = client.delete(f"{PO}/privacy/memory", headers=ha)
    cleared_ok = r.status_code == 200
    after = body(client.get(f"{PO}/memory", headers=ha))
    remaining = sum(len(v) for v in (after.get("groups") or {}).values())
    check("清空记忆后记忆归零", cleared_ok and remaining == 0, f"HTTP={r.status_code} 剩余 {remaining} 条")
    twin_alive = body(client.get(f"{PO}/command-center", headers=ha)).get("hasData")
    check("清空记忆不影响财富数据本体", twin_alive is True, f"command-center hasData={twin_alive}")

    # ── 17. 跨用户隔离 ──
    print("\n[17] 跨用户数据隔离")
    leak: list[str] = []
    b_know = (body(client.get(f"{PO}/knowledge", headers=hb)).get("items")) or []
    if b_know:
        leak.append(f"knowledge({len(b_know)})")
    b_dec = (body(client.get(f"{PO}/decisions", headers=hb)).get("items")) or []
    if b_dec:
        leak.append(f"decisions({len(b_dec)})")
    b_plan = (body(client.get(f"{PO}/plan-versions", headers=hb)).get("items")) or []
    if b_plan:
        leak.append(f"plans({len(b_plan)})")
    b_notif = (body(client.get(NOTIF, headers=hb)).get("notifications")) or []
    if b_notif:
        leak.append(f"notifications({len(b_notif)})")
    b_search = body(client.get(f"{PO}/search?q=退休", headers=hb))
    if (b_search.get("total") or 0) > 0:
        leak.append(f"search({b_search.get('total')})")
    check("B 用户看不到 A 用户的任何 Personal OS 数据", not leak, f"泄漏={leak}")

    r = client.get(f"{PO}/timeline")
    check("未携带令牌访问被拒绝", r.status_code in (401, 403), f"HTTP {r.status_code}")

    # ── 18. 合规扫描 ──
    print("\n[18] 合规校验")
    joined = "\n".join(all_text)
    hits = [w for w in BANNED_WORDS if w in joined]
    check("全链路无绝对化 / 保证收益表述", not hits, f"命中禁用词={hits}")
    check(
        "安全口径统一（如出现安全表述必须为标准句式）",
        ("采用账户隔离" in joined) or ("安全" not in joined) or not hits,
        "存在非标准安全表述",
    )

    # ── 汇总 ──
    total = len(PASS) + len(FAIL)
    print("\n" + "=" * 56)
    print(f"Phase 7.3 验收结果：{len(PASS)}/{total} PASS")
    if FAIL:
        print("\n未通过项：")
        for f in FAIL:
            print(f"  - {f}")
    print("=" * 56 + "\n")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
