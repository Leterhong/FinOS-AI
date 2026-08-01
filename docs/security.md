# 安全设计 · Security

> FinOS AI 处理的是用户最敏感的个人财务数据。本文档描述系统的安全设计：认证、授权、加密、隔离、审计与隐私控制。

## 1. 安全原则

| 原则 | 落地方式 |
|---|---|
| **数据属于用户** | 全部数据本地/自托管，无第三方数据回传；支持一键完整导出与彻底删除 |
| **默认最小暴露** | 越权返回 404 不泄露资源存在性；错误响应绝不含堆栈或内部路径 |
| **敏感字段永不明文落盘** | 金额、路径、原文使用 AES-256-GCM 透明加密 |
| **密钥永不出库** | 用户的 LLM API Key 加密存储，任何响应与导出只返回掩码 |
| **AI 不得擅自改动财务数据** | 所有 AI 识别结果需用户显式确认才写入 |

## 2. 认证 Authentication

### 2.1 密码存储

使用 **bcrypt** 哈希（自适应成本因子），明文密码永不落库、永不进日志。

```
users.password_hash  ←  bcrypt(password)
```

### 2.2 JWT 双令牌机制

| 令牌 | 有效期 | 存储位置 | 用途 |
|---|---|---|---|
| Access Token | 7 天（`JWT_EXPIRE_MINUTES`） | localStorage `finos_token` | 每次 API 请求携带 |
| Refresh Token | 30 天（`JWT_REFRESH_EXPIRE_DAYS`） | 客户端安全存储 | 换取新的令牌对 |

**Refresh Token 轮换**：`POST /api/auth/refresh` 每次签发新令牌对的同时，将旧 refresh 的 `jti` 置为 `revoked=True`。数据库中**只存 `jti` 不存 token 本体**，即使 `refresh_tokens` 表泄露也无法伪造令牌。

```
登录 ──▶ (access_1, refresh_1)
         refresh_tokens: jti_1 (revoked=false)

刷新 ──▶ (access_2, refresh_2)
         refresh_tokens: jti_1 (revoked=TRUE) ← 立即失效
                         jti_2 (revoked=false)

用旧 refresh_1 再刷新 ──▶ 401（已吊销，检测到重放）
```

**登出**：`POST /api/auth/logout` 吊销当前 refresh token，幂等。

### 2.3 双鉴权桥接

前端存在两套鉴权上下文，必须同时维护：

| 上下文 | 凭据 | 校验方 |
|---|---|---|
| FastAPI 后端 | JWT（localStorage `finos_token`） | `get_current_user` 依赖 |
| Next.js 路由守卫 | `finos_session` httpOnly cookie | `middleware.ts` |

- 登录/注册成功后必须调用 `POST /api/auth/session` 补种 cookie
- 登出/注销账户必须调用 `POST /api/auth/logout` 清除 cookie

否则会出现 `/login` ↔ 受保护页的重定向死循环。

**Cookie `secure` 标志**由 `isSecureContext(req)` 根据 `x-forwarded-proto` 或请求协议动态判断。**严禁写死 `NODE_ENV === "production"`** —— 生产模式下 HTTP 部署会导致浏览器拒收 cookie。

## 3. 授权 Authorization

### 3.1 用户隔离铁律

**所有**数据库查询强制携带 `user_id` 过滤，无例外：

```python
asset = db.query(Asset).filter(
    Asset.id == asset_id,
    Asset.user_id == user.id,     # ← 强制条件，不可省略
).first()
if not asset:
    raise HTTPException(404, "资源不存在")
```

### 3.2 越权返回 404 而非 403

访问他人资源时返回 **404**（而非 403），不泄露"该资源确实存在但你无权访问"这一信息。资源所有权校验统一走 `require_owned_resource()`，它区分两种情形：

- 资源不存在 → 404
- 资源存在但归属他人 → 404（对外表现一致）
- 仅在明确的权限层级场景才返回 403

### 3.3 工具调用上下文锁定

Agent 工具调用（`POST /api/agents/tools/call`）强制注入当前用户上下文，Agent 无法通过参数指定他人 `user_id`。

## 4. 数据加密 Encryption

### 4.1 字段级透明加密

敏感字段使用 SQLAlchemy `TypeDecorator`（`backend/security/types.py`），在 ORM 读写时自动加解密：

```python
class Asset(Base):
    amount: Mapped[float] = mapped_column(EncryptedFloat, default=0.0)
    #                                      ↑ 业务代码无感知，写入即加密
```

| 项 | 说明 |
|---|---|
| 算法 | AES-256-GCM（认证加密，同时保证机密性与完整性） |
| 密钥 | 环境变量 `ENCRYPTION_MASTER_KEY`（URL-safe Base64 的 32 字节） |
| 密文格式 | `aesgcm:v1:<base64>`，带版本前缀便于未来轮换 |
| 存储 | 底层列类型为 `TEXT` |

**加密字段清单**（共 7 处）：

| 表 | 字段 |
|---|---|
| `financial_profiles` | `income`, `expense` |
| `assets` | `amount` |
| `transactions` | `amount` |
| `documents` | `storage_path` |
| `multimodal_inputs` | `storage_path`, `raw_text` |

即使数据库文件被完整拖走，攻击者拿到的也是密文。

### 4.2 LLM API Key 保护

用户配置的第三方模型 API Key 使用 **Fernet** 加密后存入 `ai_model_configs.api_key_encrypted`：

| 场景 | 返回内容 |
|---|---|
| `GET /api/ai/models` | 仅 `key_mask`（形如 `sk-****abcd`） |
| `GET /api/backup/export` | 仅掩码 |
| `GET /api/backup/database` | 密文（不解密） |
| 前端任何页面 | 永不显示明文 |

明文 Key 仅在后端内存中、调用 LLM 的瞬间存在。

### 4.3 存量数据自愈加密

开发环境启动时（`lifespan`），`encrypt_existing_sensitive_data()` 会幂等地将历史明文敏感字段原地升级为密文，无需手动迁移。

## 5. 传输与中间件安全

### 5.1 中间件链

```
请求 ──▶ SecurityMiddleware ──▶ MetricsMiddleware ──▶ CORSMiddleware ──▶ 路由
           │                       │
           ├─ CSRF 双提交校验        └─ 记录耗时/状态码（无 PII）
           └─ 滑动窗口限流
```

### 5.2 CSRF 防护

采用**双提交 Cookie**模式：

1. `GET /api/auth/csrf` 下发 token，同时写入非 HttpOnly cookie 和响应体
2. 客户端在后续写操作请求头携带该 token
3. 中间件比对 header 与 cookie 是否一致

### 5.3 限流

进程内滑动窗口限流（`backend/security/middleware.py`）：

| 类型 | 默认 | 配置项 |
|---|---|---|
| 普通接口 | 300 次/分钟 | `API_RATE_LIMIT_PER_MINUTE` |
| AI 接口 | 30 次/分钟 | `AI_RATE_LIMIT_PER_MINUTE` |

超限返回 429。

### 5.4 CORS

白名单机制，仅允许 `CORS_ORIGINS` 中显式列出的来源，`allow_credentials=True`。生产环境必须收窄为实际域名。

### 5.5 输入限制

| 项 | 限制 | 配置项 |
|---|---|---|
| AI 单次输出 token | 8192 | `AI_MAX_TOKENS` |
| AI 单次输入字符 | 100,000 | `AI_MAX_INPUT_CHARS` |
| 请求参数校验 | Pydantic 强类型 | — |

## 6. 文件上传安全

| 防护 | 实现 |
|---|---|
| 按用户隔离存储 | 每个用户独立子目录，路径由服务端生成 |
| 路径穿越防护 | 下载时校验解析后的真实路径必须在允许目录内 |
| 存储路径加密 | `documents.storage_path` 为 `EncryptedString` |
| 文件名不可控 | 服务端重命名，原文件名仅作展示字段 |
| 内容哈希 | `multimodal_inputs.content_hash` 用于去重与完整性校验 |

## 7. 错误处理与信息泄露防护

三层异常处理器（`backend/main.py`）：

| 异常类型 | 响应 |
|---|---|
| `HTTPException` | `{"success": false, "error": "<detail>"}` + 原状态码 |
| `RequestValidationError` | `{"success": false, "error": "请求参数不合法"}` + 422 |
| 未捕获 `Exception` | `{"success": false, "error": "服务器内部错误"}` + 500 |

未捕获异常会：
1. 通过 `log_event` 记录结构化日志（含异常类型与路径，供排障）
2. 写入 `security_events` 表
3. **响应体绝不包含堆栈、SQL、文件路径或内部实现细节**

前端同样配置了根级与 dashboard 级错误边界，崩溃时展示友好提示而非堆栈。

## 8. 审计与可观测

### 8.1 审计日志

| 表 | 记录内容 |
|---|---|
| `audit_logs` | `action`（操作类型）、`resource`、`ip`、`user_id`、时间 |
| `security_events` | `event_type`、`severity`、`details`、`ip`、时间 |

用户可通过 `GET /api/security/audit-logs` 与 `GET /api/security/events` 查看自己的记录。

### 8.2 结构化日志脱敏

`log_event()` 统一输出结构化日志，自动脱敏敏感字段（密码、token、API Key、金额）。日志中不出现任何可识别的财务数值。

### 8.3 指标

`GET /api/metrics` 暴露接口耗时与错误率，**不含任何 PII**，可直接接入 Prometheus。

## 9. 隐私控制（用户权利）

FinOS AI 提供完整的数据主体权利支持：

| 权利 | 端点 | 说明 |
|---|---|---|
| **数据可携权** | `GET /api/personal-os/privacy/export` | 导出本人全部数据（结构化 JSON） |
| **数据导出** | `GET /api/backup/export` | json / csv 格式，解密明文，Key 仅掩码 |
| **被遗忘权** | `DELETE /api/security/account` | 彻底删除账户及全部 43 张表中的关联数据 |
| **AI 记忆清除** | `DELETE /api/personal-os/privacy/memory` | 仅清 AI 记忆，保留财务数据 |
| **隐私中心** | 前端 `/privacy-center` | 可视化管理上述所有操作 |

**账户注销的双重确认**：必须同时提供正确密码 **和** 确认短语 `DELETE MY DATA`，防止误操作与 CSRF 触发。

## 10. 生产安全检查清单

部署到生产前逐项确认：

- [ ] `DEBUG=false`
- [ ] `JWT_SECRET` 已改为随机 64 字符（`openssl rand -hex 32`）
- [ ] `ENCRYPTION_MASTER_KEY` 已设置且**已离线备份**（丢失则密文永久不可恢复）
- [ ] `POSTGRES_PASSWORD` / `REDIS_PASSWORD` 已改为强密码
- [ ] `BACKUP_API_KEY` 已设置
- [ ] `CORS_ORIGINS` 收窄为实际生产域名，不含 `localhost`
- [ ] 已启用 HTTPS（`deploy/nginx/conf.d-tls`）
- [ ] 数据库端口未暴露到公网
- [ ] `.env` 文件未提交到 Git（`.gitignore` 已覆盖）
- [ ] 已配置定期备份（`deploy/scripts/backup.sh`）
- [ ] 已验证 `/api/health` 返回正常

## 11. 安全边界声明

FinOS AI 是**自托管**的个人工具，其安全性依赖于部署者对宿主环境的管控。本项目：

- 不提供多租户 SaaS 级别的隔离保证（虽然代码层面强制 `user_id` 隔离）
- 不承诺抵御拥有宿主机 root 权限的攻击者
- 不对用户自行配置的第三方 LLM 服务的数据处理行为负责

**我们不使用"绝对安全""百分之百安全""完全安全"这类表述。** 安全是持续的工程实践，而非一次性承诺。若发现安全问题，请通过 Issue 或私下渠道报告。

---

**免责声明**：FinOS AI 提供信息分析和辅助决策，不构成投资建议。
