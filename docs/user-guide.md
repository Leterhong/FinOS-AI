# FinOS AI 使用指引

> 本指南面向首次使用 FinOS AI 的业务用户（信贷经理、风控人员、尽调分析师）。
> 按照以下步骤，你可以完成一次从"上传资料"到"输出风险清单"的完整企业金融研判。

---

## 快速开始（5 分钟上手）

### 第 0 步：启动系统

FinOS AI 提供三种启动方式，按设备与场景选择。

#### 方式一：只体验前端（最快，Node.js 20+）

```bash
git clone https://github.com/Leterhong/FinOS-AI.git
cd FinOS-AI
npm install
npm run dev
```

打开浏览器访问 **http://localhost:3000**。系统以空工作区启动，不会预置任何企业、金额或风险数据。此方式没有后端，AI 调用与数据同步不可用，项目管理、规则录入与资料上传仍可用。

#### 方式二：完整本地服务（Linux / macOS）

前置：Node.js 20+、Python 3.11+。

Linux（Debian / Ubuntu）先安装 Python 与虚拟环境支持：

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip
```

macOS 使用 Homebrew 安装（`brew` 可从 <https://brew.sh> 获取）：

```bash
brew install node python@3.11
```

创建虚拟环境并启动后端：

```bash
git clone https://github.com/Leterhong/FinOS-AI.git
cd FinOS-AI

python3 -m venv .venv

# Windows 使用 .\.venv\Scripts\activate
source .venv/bin/activate

pip install -r backend/requirements.txt

# 本地开发：未配置密钥时用开发模式启动临时随机密钥
ENV=development python -m uvicorn backend.main:app --host 127.0.0.1 --port 8300 --reload
```

> 需要稳定密钥或数据加密时，请改为在 `backend/.env` 设置 `JWT_SECRET` 与 `ENCRYPTION_MASTER_KEY` 后再启动。未设置且未开启开发模式时，后端会拒绝启动以保护密钥。密钥生成方式见 [部署文档 · 环境变量](./deployment.md)。

另开一个终端启动前端：

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。前端内置 fallback rewrite，未匹配的 `/api/*` 会自动代理到 `http://127.0.0.1:8300`，无需设置 `NEXT_PUBLIC_BACKEND_URL`，可用 `BACKEND_PROXY_URL` 覆盖。

#### 方式三：Docker Compose 一键部署（推荐用于生产）

前置：Docker 24+ 与 Docker Compose V2。macOS / Windows 安装 Docker Desktop，Linux 安装 Docker Engine 与 compose 插件。

```bash
git clone https://github.com/Leterhong/FinOS-AI.git
cd FinOS-AI

# 自动生成 .env 并填入随机密钥，再构建并启动全部服务
bash deploy.sh
```

`deploy.sh` 会复制 `.env.example` 为 `.env`，自动生成 PostgreSQL、Redis、JWT、AES 主密钥与前端数据密钥，随后构建镜像、启动 `db / redis / api / web / nginx` 并等待各服务健康，最后探活访问入口。

也可以手动执行，务必先替换全部 `CHANGE_ME_*` 占位值，否则后端弱密钥守卫与生产编排会拒绝启动：

```bash
cp .env.example .env
# 编辑 .env：生成并填入 JWT_SECRET、ENCRYPTION_MASTER_KEY、FINOS_DATA_KEY、POSTGRES_PASSWORD、REDIS_PASSWORD
docker compose up -d --build
```

启动后通过 <http://localhost> 访问（默认 nginx 80 端口，可用 `HTTP_PORT` 修改）。Docker 默认经 nginx 使用同源 `/api` 代理，`NEXT_PUBLIC_BACKEND_URL` 保持为空。

```bash
# 查看服务与健康状态
docker compose ps

# 跟踪后端日志
docker compose logs -f api

# 停止（保留数据卷）
docker compose down

# 停止并删除数据卷（数据丢失）
docker compose down -v
```

生产 HTTPS 部署使用覆盖层：

```bash
bash deploy.sh --prod
```

需要 TLS 证书，放于 `deploy/nginx/certs/`。完整环境要求、变量清单与故障排查见 [部署文档](./deployment.md)。

### 第 1 步：接入 AI 模型（必须）

没有模型连接时，AI 分析功能不可用。系统会明确提示"模型未配置"。

1. 点击左侧栏 **AI 模型中心**
2. 点击 **添加模型**，按向导三步完成：
   - **连接**：选择 Provider（DeepSeek / OpenAI / Ollama 等），填入 Base URL 和 API Key
   - **模型**：填写模型 ID（如 `deepseek-chat`），选择任务角色
   - **验证**：点击"发送真实测试请求"，确认连接成功
3. 测试通过后点击 **保存并启用**

> 支持 OpenAI、DeepSeek、通义千问、Claude、Gemini、智谱、Moonshot、Ollama 及任意 OpenAI 兼容接口。

### 第 2 步：创建企业项目

1. 点击左侧栏 **项目中心**
2. 点击 **新建项目**，填写：
   - 企业名称（必填）
   - 研判任务（如"流动资金贷款尽调"）
   - 所属行业、融资金额、负责人
3. 创建后自动进入**项目工作台**

> 项目是所有资料、风险、规则和 AI 分析的容器。创建多个项目互不干扰。

### 第 3 步：上传资料并触发 AI 研判

1. 进入项目工作台后，点击 **资料研判**
2. 选择已创建的项目，点击 **上传并 AI 分析**
3. 支持 PDF、Word（docx）、Excel（xlsx/csv）、TXT、Markdown、JSON 和图片
4. 系统按以下阶段执行（右侧清单实时显示进度）：
   - ✓ 解析文件结构与文本
   - ● 抽取结构化事实（模型调用，约 30–60 秒）
   - ○ 规则引擎确定性判定
   - ○ 生成研判叙述（模型调用，约 30–60 秒）
5. 完成后可查看：
   - **结构化事实**：每条携带原文引用
   - **确定性规则命中**：由规则引擎（非 LLM）对事实判定
   - **AI 研判叙述**：引用事实的分析文本

> 点击事实条目的 **「定位原文」** 按钮可跳转到研判文本中的引用位置。
> 点击 **「转候选风险」** 可将事实直接登记为待核验风险。

### 第 4 步：录入业务规则

1. 点击左侧栏 **规则库**
2. 点击 **新建规则**，填写规则编号、名称和业务领域
3. （可选）填写**触发条件**：指标名称（如"货币资金"）、比较算子、阈值
4. 填写了触发条件的规则，后续上传的资料会自动由规则引擎判定是否命中
5. 已有资料也可以点击规则的 **「运行测试样本」** 来验证规则逻辑

> 规则命中由确定性规则引擎（非 LLM）计算，结果可复现、可审计。

### 第 5 步：管理风险

1. 点击左侧栏 **风险中心**
2. 查看待核验的候选风险（来自事实台账或 AI Agent 发现）
3. 对每条风险：
   - 点击 **人工核验** → 填写复核人和意见 → 状态变为"已确认"
   - 已确认的风险可点击 **登记缓释措施** → 状态变为"已缓释"
4. 点击风险**标题**可打开结构化详情抽屉（What / Severity / Evidence / Rule / Impact / Review / Traceability）
5. 可一键**复制风险清单**为 Markdown 格式

> 所有核验操作都会留痕（操作人、时间、意见），进入不可篡改的审计记录。

### 第 6 步：使用 AI 智能助手

1. 点击左侧栏 **智能研判助手**
2. 选择要研判的企业项目
3. 输入问题（如"分析当前流动资金风险"）
4. AI 回复采用流式输出，逐步显示
5. AI 只基于当前项目的资料、规则和风险上下文回答——数据不足时会明确说明

> 助手不会执行审批、付款或对外发送操作。所有 AI 建议需人工复核。

### 第 7 步：管理流程任务

1. 点击左侧栏 **流程中心**
2. 查看顶部**研判流程全景**（资料上传 → AI 分析 → 规则匹配 → 风险检出 → 人工复核 → 决策交付）
3. 在看板中创建和推进任务：待处理 → 处理中 → 待复核 → 已完成
4. 超期任务自动标红

### 第 8 步：投研与报告

- **投研中心**：输入研究主题，AI 生成结构化研究底稿，可一键复制为 Markdown
- **项目报告**：在项目工作台可导出包含事实、风险和结论的完整 Markdown 报告

### 第 9 步：企业治理（多角色场景）

点击左侧栏 **企业治理**，支持：

| 功能 | 说明 |
|---|---|
| 组织与成员 | 邀请成员（需本人确认后生效），分配 Owner/Admin/Analyst/Reviewer/Viewer 五级角色 |
| 项目授权 | 按最小权限原则，逐项目授予查看/复核/编辑/管理权限 |
| 数据分级 | 为项目和资料设置 public/internal/confidential/restricted 四级密级 |
| 人工复核队列 | 关键输出须由复核角色批准或驳回 |
| 规则版本 | 每次规则修改自动留版本快照，支持回放 |
| 模型评测 | 定义评测样本，记录评分与防护标志 |
| 连接器 | 配置外部数据源同步（需公网 HTTPS 地址） |
| 审计 | 全量操作留痕（Who/Action/Object/Result/When/Source），支持搜索和详情 |

---

## 环境变量配置

生产环境至少需要为 `JWT_SECRET`、`ENCRYPTION_MASTER_KEY`、`FINOS_DATA_KEY`、`POSTGRES_PASSWORD`、`REDIS_PASSWORD` 配置强随机值。前后端采用同一策略：缺失、过短或使用示例占位值时会拒绝启动。

配置模板：

- [`.env.example`](../.env.example)：Docker Compose
- [`.env.local.example`](../.env.local.example)：Next.js 本地开发
- [`backend/.env.example`](../backend/.env.example)：FastAPI

模型密钥不要添加 `NEXT_PUBLIC_` 前缀，该前缀变量会被编译进浏览器产物。真实 `.env`、数据库、上传目录、虚拟环境和构建产物均不应提交到 Git。

---

## 快捷键

| 快捷键 | 功能 |
|---|---|
| ⌘K / Ctrl+K | 打开全局命令面板（搜索项目、资料、风险、页面） |
| Esc | 关闭命令面板 / 对话框 / 抽屉 |

---

## 数据存储说明

- **本地即时持久化**：所有业务数据首先保存在浏览器 localStorage 中，刷新不丢失
- **服务端同步**：如果后端正在运行，数据会自动同步到服务端数据库（侧栏底部显示同步状态）
- **跨设备恢复**：换设备后打开系统，自动从服务端恢复之前的数据
- **仅本地模式**：后端不可达时，侧栏底部显示"仅本地模式"，数据只保存在当前浏览器
- **清空工作区**：右上角头像菜单 → 清空工作区（同时清空本地和服务端数据）

---

## 常见问题

### Q: 为什么 AI 分析按钮是灰色的？
A: 需要先到 AI 模型中心配置并测试通过一个模型。

### Q: 上传 PDF 后提示"未能提取可分析文本"？
A: 扫描版 PDF 没有文本层，请先完成 OCR，或转为图片上传（系统支持图片 OCR）。

### Q: 规则命中了但我觉得不应该命中？
A: 规则命中由确定性引擎计算（非 LLM），点击规则行的"运行测试样本"可以验证逻辑。如果条件有误，直接编辑规则即可。

### Q: 换了浏览器后数据没了？
A: 数据首先存在浏览器本地。如果后端在运行，数据会自动同步到服务端并可在新设备恢复。如果后端没在运行，数据只存在当前浏览器。

### Q: 侧栏底部显示"仅本地模式"是什么意思？
A: 表示 FastAPI 后端不可达，数据只保存在当前浏览器。启动后端后刷新页面即可恢复服务端同步。

### Q: AI 分析出的结论可以直接用吗？
A: **不可以。** 所有 AI 输出都需要人工复核。系统设计原则是 Evidence First + Human in the Loop——AI 帮你理解资料和发现线索，最终决策由有权限的业务人员做出。

---

## 安全边界

- AI 不执行审批、授信、投资、付款或对外发送
- AI 不在没有证据时给出确定性结论
- 所有重要判断可追溯到原始资料和命中规则
- 模型密钥只在服务端加密保存，不返回浏览器
- 重大结论必须由有权限的业务人员复核
