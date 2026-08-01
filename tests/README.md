# FinOS AI 测试体系

三层测试，各自守住不同的失效模式。全部可在**不连接任何大模型、不依赖外部服务**的环境下运行。

| 层 | 目录 | 技术 | 守住什么 |
| --- | --- | --- | --- |
| 后端 API | `tests/backend/` | pytest + FastAPI TestClient | 鉴权、用户隔离、数据正确性、错误契约 |
| AI 质量 | `tests/ai/` | pytest | 无模型时的本地确定性算法、零数据欢迎态、合规口径 |
| 前端契约 | `tests/frontend/` | Node 内置 test runner | 品牌红线、安全红线、白屏风险、开源定位 |

## 快速开始

```bash
# 后端 + AI 层（Python）
PYTHONPATH=. pytest tests/backend tests/ai -v

# 前端契约层（Node，零额外依赖）
node --test tests/frontend/contract.test.mjs

# 全部
PYTHONPATH=. pytest && node --test tests/frontend/contract.test.mjs
```

首次运行需安装测试依赖：

```bash
pip install pytest pytest-asyncio
```

## 隔离保证

测试**绝不触碰开发数据库**。`tests/conftest.py` 在导入任何 `backend` 模块之前
改写 `DATABASE_URL`，指向 `tests/.tmp/test.db`；每个测试函数开始前清空全部业务表，
因此用例之间零耦合、可任意乱序或并行执行。

同时固定了测试专用的 `JWT_SECRET` 与 `ENCRYPTION_MASTER_KEY`（32 字节），
保证加密字段可正常读写而不污染真实环境。

## 后端测试（`tests/backend/`）

| 文件 | 覆盖范围 |
| --- | --- |
| `test_auth.py` | 注册/登录/`/me`、Refresh Token 轮换与重放拒绝、登出吊销、CSRF 下发、跨重登数据持久性 |
| `test_isolation.py` | 用户隔离铁律：资产/交易/画像/知识库跨用户零泄露，越权一律 404 |
| `test_financial.py` | 画像与资产 CRUD、输入校验、Twin 计算与缓存失效 |
| `test_ai.py` | 模型配置（API Key 永不回传）、用量聚合结构、无模型时优雅降级 |
| `test_agents.py` | 5 个内置 Agent 可运行、工作流、工具上下文锁定、运行日志隔离 |
| `test_rag.py` | 知识入库/检索/片段管理、空知识库优雅返回、跨用户检索零泄露 |
| `test_security.py` | 安全响应头、错误不泄露堆栈、登录限流、密钥零泄露、上传防护 |

### 关键断言口径

**越权一律返回 404。** 返回 403 会形成「资源存在性」侧信道，
让攻击者通过状态码差异枚举真实资源 ID。`require_owned_resource`
对越权访问只写服务端审计日志，对外与「不存在」完全一致。

**API Key 明文零出现。** 测试会在响应原文中全文搜索密钥字符串，
任何接口（包括用量统计、用户信息）泄露即失败。

**零数据用户返回欢迎态。** 新用户不得看到任何编造的分数或他人数据，
`hasData=False` + 欢迎文案是硬性契约。

## AI 质量测试（`tests/ai/`）

FinOS AI 的核心承诺是「**没有大模型也能用**」。所有智能能力都有本地确定性兜底，
这一层验证兜底算法本身：

- **目标金额解析**：`10年内攒够500万` → `5_000_000`，绝不误取「10年」的 10；
  `55岁退休` → `None`（年龄不是金额）。
- **六维评分**：维度口径、权重之和为 1、分值恒在 0–100，极端输入（零收入、
  负净值、超大资产）不越界不崩溃。
- **合规口径**：全量扫描后端源码，禁止出现「绝对安全 / 保证收益 / 稳赚」等表述。

## 前端契约测试（`tests/frontend/`）

不检查 UI 长什么样，只守住「一旦破坏就会引发生产事故或违背产品原则」的硬规则：

- **后端通道唯一性** —— 禁止绕过 `backendApi` 硬编码后端地址。
- **品牌红线** —— 禁止紫色系硬编码；涨跌配色必须走统一的 `updownClass`。
- **合规文案** —— 违规承诺检测支持否定语境（「禁止保证收益」是正确写法）。
- **开源定位** —— 禁止出现支付、订阅、套餐升级等收费代码。
- **登录死循环防护** —— `session.ts` 的 cookie `secure` 必须按请求协议动态判断，
  写死 `NODE_ENV === "production"` 会让 HTTP 部署下无法登录。
- **兜底密钥守卫** —— 使用 `DEV_FALLBACK_SECRET` 的文件必须有生产环境 `throw`，
  否则开源仓库里的公开密钥会让加密形同虚设。
- **白屏防护** —— `data.xxx.map()` 必须有 `?? []` 兜底。

## 编写新用例

后端用例直接用 `client` fixture，它已处理好建表、清库、限流复位：

```python
def test_something(client, auth):
    resp = client.post(f"{API}/financial/assets",
                       json={"type": "cash", "name": "活期", "amount": 1000},
                       headers=auth)
    assert resp.status_code == 200
    data = assert_envelope(resp)          # 校验统一响应信封
    assert data["id"]
```

验证隔离时用双用户装置：

```python
def test_isolation(client, user_a, user_b):
    ...  # user_a["headers"] / user_b["headers"]
```

## 已知注意事项

- 登录/注册端点限流为 **10 次/分钟/IP**。批量注册用户的用例需调用
  `SecurityMiddleware._requests.clear()`（`client` fixture 已自动处理）。
- 后端测试会真实执行 bcrypt 哈希，单次注册约 0.5 秒，全量后端测试约 1–2 分钟属正常。
- `tests/.tmp/` 是临时数据库目录，已在 `.gitignore` 中忽略。
