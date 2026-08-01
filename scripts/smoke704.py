import os, sys, tempfile, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.gettempdir()}/finos_smoke_{os.getpid()}.db"
os.environ["ENCRYPTION_MASTER_KEY"] = "qqVLJLsnK_PMt7Im3Qz006hjBsZw9XT3aDkZVuvY_Pk="
os.environ["JWT_SECRET"] = "smoke-jwt-secret-for-test-only"
from backend.database import init_db
from fastapi.testclient import TestClient
from backend.main import app

init_db()
with TestClient(app) as c:
    # 1) health
    r = c.get("/api/health")
    print("HEALTH", r.status_code, r.json()["data"]["status"], r.json()["data"]["redis"]["mode"], r.json()["data"]["database"]["status"])

    # 2) register + login
    em = f"smoke{os.getpid()}@finos.test"
    reg = c.post("/api/auth/register", json={"email": em, "password": "Passw0rd!23", "name": "Smoke"})
    print("REG", reg.status_code)
    login = c.post("/api/auth/login", json={"email": em, "password": "Passw0rd!23"})
    tok = login.json()["data"]["token"]
    c.headers.update({"Authorization": f"Bearer {tok}"})

    # 3) async task ping (non-blocking)
    t = c.post("/api/tasks", json={"task_type": "ping", "payload": {"hello": "world"}})
    print("TASK_CREATE", t.status_code, t.json()["data"]["task_id"])
    tid = t.json()["data"]["task_id"]

    # 4) poll until completed
    status = "pending"
    g = None
    for _ in range(20):
        g = c.get(f"/api/tasks/{tid}")
        status = g.json()["data"]["status"]
        if status in ("completed", "failed"):
            break
        time.sleep(0.3)
    print("TASK_STATUS", status, g.json()["data"]["result"])

    # 5) metrics recorded
    m = c.get("/api/metrics")
    print("METRICS_KEYS", list(m.json()["data"].keys())[:3] if m.status_code == 200 else m.status_code)
print("SMOKE_DONE")
