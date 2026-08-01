"""任务 #307 — Phase 7.0.4 生产验收。

运行（项目根，PYTHONPATH=.）：
  python scripts/phase704-acceptance.py

覆盖：
  1. 健康与指标：/api/health database ok + redis mode 记录 + uptime>0；/api/metrics 有统计。
  2. 100 请求稳定性：对 /api/health 连续 100 次，100% 成功 + 平均耗时打印。
  3. 并发异步任务不阻塞：并发 5 个 ping 任务，15s 内全部 completed；穿插同步 GET 正常。
  4. Redis 异常降级：REDIS_URL 指向不可达地址，cache.mode==memory 且 set/get 正常，/api/health 报 degraded 而非 500。
  5. DB 恢复：SQLite 重开 TestClient 指向同一文件，之前注册用户仍可登录。
  6. 配置校验：docker-compose.yml 解析 + ≥6 服务；nginx default.conf 含 limit_req/ssl_certificate；
     .env.example 不含真实密钥（无 sk- 开头长串）。
  7. 代码质量：python -m compileall -q backend rc=0；npx tsc --noEmit 0 错误。

全部通过则 PASS=X FAIL=0；否则修复后重跑。
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# ---- 必须在 import backend 之前设置 ----
_TMP = Path(tempfile.mkdtemp(prefix="finos704_"))
_DB = _TMP / "finos704.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB.as_posix()}"
os.environ["ENCRYPTION_MASTER_KEY"] = "qqVLJLsnK_PMt7Im3Qz006hjBsZw9XT3aDkZVuvY_Pk="
os.environ["JWT_SECRET"] = "test-jwt-secret-for-phase704-acceptance-32b"
os.environ["MIGRATE_LEGACY_DATA"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402

passed = 0
failed = 0
failures: list[str] = []
REDIS_ACTUAL_MODE = "unknown"


def assert_ok(cond: bool, msg: str) -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {msg}")
    else:
        failed += 1
        failures.append(msg)
        print(f"  ✗ {msg}")


# ============================================================
# 1 & 2 & 3. 健康/指标/稳定性/并发（同一 TestClient 生命周期）
# ============================================================
def test_health_metrics_stability_concurrency() -> None:
    global REDIS_ACTUAL_MODE
    print("\n=== 1) 健康与指标 / 2) 稳定性 / 3) 并发非阻塞 ===")
    with TestClient(app) as client:  # 启动 worker + init_db
        # 1) health
        r = client.get("/api/health")
        assert_ok(r.status_code == 200, "/api/health 返回 200")
        j = r.json()
        assert_ok(j.get("success") is True, "/api/health 统一信封 success=true")
        assert_ok(j["data"]["database"]["status"] == "ok", "database 状态 ok")
        REDIS_ACTUAL_MODE = j["data"]["redis"]["mode"]
        print(f"  · redis 实际 mode = {REDIS_ACTUAL_MODE}（memory 降级可接受）")
        assert_ok(j["data"]["uptime_seconds"] >= 0, "uptime_seconds >= 0")
        # metrics 有统计
        m = client.get("/api/metrics")
        assert_ok(m.status_code == 200 and m.json().get("success"), "/api/metrics 返回成功")

        # 2) 100 请求稳定性
        n = 100
        ok_cnt = 0
        t0 = time.perf_counter()
        for _ in range(n):
            rr = client.get("/api/health")
            if rr.status_code == 200:
                ok_cnt += 1
        elapsed = time.perf_counter() - t0
        avg = (elapsed / n) * 1000
        print(f"  · 100 次 /api/health：成功 {ok_cnt}/{n}，平均 {avg:.2f} ms")
        assert_ok(ok_cnt == n, "100 请求 100% 成功")
        m2 = client.get("/api/metrics").json()["data"]
        assert_ok("GET /api/health" in m2, "/api/metrics 含端点统计（GET /api/health）")

        # 3) 并发异步任务不阻塞（/api/tasks 需鉴权）
        import concurrent.futures as cf

        auth_r = client.post("/api/auth/register",
                             json={"email": f"ping704_{int(time.time())}@finos.test", "password": "Passw0rd!2026"})
        assert_ok(auth_r.status_code == 200 and auth_r.json().get("success"), "并发测试前注册用户")
        tok = auth_r.json()["data"]["token"]
        hdr = {"Authorization": f"Bearer {tok}"}

        def create_ping():
            rr = client.post("/api/tasks", json={"task_type": "ping", "payload": {"i": 1}}, headers=hdr)
            j = rr.json()
            assert j.get("success"), f"创建 ping 任务失败: {j}"
            return j["data"]["task_id"]

        tids: list[str] = []
        with cf.ThreadPoolExecutor(max_workers=5) as ex:
            tids = list(ex.map(lambda _: create_ping(), range(5)))
        assert_ok(len(tids) == 5 and all(tids), "并发创建 5 个 ping 任务成功")

        # 穿插一个同步 GET（不应被阻塞）
        sync_ok = client.get("/api/health").status_code == 200
        assert_ok(sync_ok, "并发期间同步 GET /api/health 正常响应")

        # 轮询完成（15s 内）
        all_done = True
        deadline = time.time() + 15
        for tid in tids:
            while time.time() < deadline:
                g = client.get(f"/api/tasks/{tid}", headers=hdr).json()
                if g.get("success") and g["data"]["status"] == "completed":
                    break
                time.sleep(0.2)
            else:
                all_done = False
        assert_ok(all_done, "5 个 ping 任务 15s 内全部 completed（不阻塞）")


# ============================================================
# 4. Redis 异常降级
# ============================================================
def test_redis_degradation() -> None:
    import backend.core.cache as cm
    from backend.config import get_settings

    print("\n=== 4) Redis 异常降级 ===")
    os.environ["REDIS_URL"] = "redis://127.0.0.1:6399/0"  # 不可达
    get_settings.cache_clear()
    cm.settings = get_settings()  # 重新绑定到新 redis_url
    cm.cache._connected = False
    cm.cache._redis = None
    mode = cm.cache.mode
    cm.cache.set("rk", "rv")
    ok_get = cm.cache.get("rk") == "rv"
    assert_ok(mode == "memory", "redis 不可达 → cache.mode == memory")
    assert_ok(ok_get, "memory 降级后 set/get 正常工作")

    with TestClient(app) as c:
        h = c.get("/api/health").json()
    assert_ok(h.get("success") is True, "/api/health 仍为成功信封（未 500）")
    assert_ok(h["data"]["redis"]["mode"] == "memory", "/api/health 报告 redis mode=memory")
    assert_ok(h["data"]["status"] == "degraded", "/api/health 整体状态 degraded（非 ok）")


# ============================================================
# 5. DB 恢复（SQLite 文件跨会话持久化）
# ============================================================
def test_db_recovery() -> None:
    print("\n=== 5) DB 恢复 ===")
    email = f"db704_{int(time.time())}@finos.test"
    pw = "Passw0rd!2026"

    with TestClient(app) as c1:
        r = c1.post("/api/auth/register", json={"email": email, "password": pw})
        assert_ok(r.status_code == 200 and r.json().get("success"), "注册用户成功")
        tok = r.json()["data"]["token"]
        r = c1.post("/api/assets", json={"type": "cash", "name": "持久资产", "amount": 42000},
                    headers={"Authorization": f"Bearer {tok}"})
        assert_ok(r.json().get("success"), "写入资产成功")

    # 关闭会话后，重开指向同一 sqlite 文件
    with TestClient(app) as c2:
        r = c2.post("/api/auth/login", json={"email": email, "password": pw})
        assert_ok(r.status_code == 200 and r.json().get("success"), "重开会话后仍可登录")
        tok2 = r.json()["data"]["token"]
        r = c2.get("/api/assets", headers={"Authorization": f"Bearer {tok2}"})
        assert_ok(r.json()["data"]["total"] == 42000, "重开会话后资产数据仍在（持久化）")


# ============================================================
# 6. 配置校验
# ============================================================
def _load_yaml(path: Path):
    try:
        import yaml
    except ImportError:
        return None
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def test_config() -> None:
    print("\n=== 6) 配置校验 ===")
    # docker-compose.yml
    dc = ROOT / "docker-compose.yml"
    assert_ok(dc.exists(), "docker-compose.yml 存在")
    if dc.exists():
        data = _load_yaml(dc)
        if data is None:
            # 无 yaml 库则用简单文本解析服务名
            text = dc.read_text(encoding="utf-8")
            services = [ln.strip().split(":")[0] for ln in text.splitlines()
                        if ln.strip().endswith(":") and " " not in ln.strip()
                        and ln.strip() not in ("services:", "volumes:", "networks:")]
            data = {"services": {s: {} for s in services}}
        svc = list((data or {}).get("services", {}).keys())
        print("  · 服务名:", svc)
        required = {"finos-db", "finos-vector", "finos-cache", "finos-api",
                    "finos-web", "finos-nginx", "finos-monitor"}
        assert_ok(len(svc) >= 6 and required.issubset(set(svc)),
                  "docker-compose 含 ≥6 个服务（含 db/vector/cache/api/web/nginx/monitor）")

    # nginx default.conf
    nc = ROOT / "deploy" / "nginx" / "conf.d" / "default.conf"
    assert_ok(nc.exists(), "deploy/nginx/conf.d/default.conf 存在")
    if nc.exists():
        t = nc.read_text(encoding="utf-8")
        assert_ok("limit_req" in t, "nginx 含 limit_req")
        assert_ok("ssl_certificate" in t, "nginx 含 ssl_certificate")

    # .env.example 不含真实 sk- 长密钥
    env = ROOT / ".env.example"
    assert_ok(env.exists(), ".env.example 存在")
    if env.exists():
        t = env.read_text(encoding="utf-8")
        import re
        real_key = re.search(r"sk-[A-Za-z0-9]{20,}", t)
        assert_ok(real_key is None, ".env.example 不含 sk- 开头真实长密钥")


# ============================================================
# 7. 代码质量
# ============================================================
def test_code_quality() -> None:
    print("\n=== 7) 代码质量 ===")
    py = subprocess.run(
        [sys.executable, "-m", "compileall", "-q", "backend"],
        cwd=str(ROOT), capture_output=True, text=True,
    )
    print("  · compileall 返回码:", py.returncode)
    assert_ok(py.returncode == 0, "python -m compileall -q backend 通过（rc=0）")

    tsc = subprocess.run(
        "npx tsc --noEmit",
        cwd=str(ROOT), capture_output=True, text=True, shell=True,
    )
    print("  · tsc 返回码:", tsc.returncode)
    if tsc.returncode != 0:
        print("  --- tsc 输出（前 40 行）---")
        print("\n".join(tsc.stdout.splitlines()[:40]))
        print("\n".join(tsc.stderr.splitlines()[:40]))
    assert_ok(tsc.returncode == 0, "npx tsc --noEmit 0 错误")


def main() -> int:
    print("########## 任务 #307 Phase 7.0.4 生产验收 ##########")
    test_health_metrics_stability_concurrency()
    test_redis_degradation()
    test_db_recovery()
    test_config()
    test_code_quality()

    print(f"\n=== 结果：PASS={passed} FAIL={failed} ===")
    print(f"=== redis 实际 mode: {REDIS_ACTUAL_MODE} ===")
    if failed:
        print("失败项：")
        for f in failures:
            print("  - " + f)
        return 1
    print("全部通过 ✅")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
