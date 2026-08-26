/**
 * FinOS AI Backend API Client（Phase 7.0.1 需求十一/十二）
 *
 * 前端改造原则：
 * - 核心财富数据统一来自后端接口，禁止读取本地 mock；
 * - Zustand 仅保存 UI 状态（主题/页面状态），财富数据以本客户端为唯一通道；
 * - Access Token 仅驻留内存；Refresh Token 由后端放入 HttpOnly Cookie；
 * - 后端统一返回格式 { success, data, message } / { success:false, error }。
 *
 * 用法：
 *   const twin = await backendApi.get<TwinData>("/financial/profile");
 *   await backendApi.post("/financial/assets", { type: "cash", name: "招行储蓄", amount: 50000 });
 */

// Docker 部署时 NEXT_PUBLIC_BACKEND_URL 留空（或同源 /api），由 nginx 把 /api 转发到 api 服务；
// 此时 BACKEND_URL 为空字符串，fetch(`${BACKEND_URL}/api${path}`) 变成同源 `/api/...`。
// 用 ?? 而非 ||：空字符串是合法的「同源」意图，不能回退到 localhost:8300（否则跨域/CORS 失败）。
// 开发环境不设置该变量时，直接回退到后端 IPv4 地址。
const configuredBackend =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8300";

// Windows 上 Node 可能把 localhost 优先解析为 ::1，而后端仅监听 IPv4，
// 从而让服务端代理接口出现 502，并进一步触发整站 401 级联。
const BACKEND_URL =
  typeof window === "undefined"
    ? configuredBackend.replace(/^http:\/\/localhost(?=:\d+|$)/, "http://127.0.0.1")
    : configuredBackend;

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

function getToken(): string | null {
  return accessToken;
}

export function setBackendToken(token: string | null): void {
  accessToken = token;
}

/** 是否已持有后端鉴权 token（SSR / 未登录态返回 false）。供路由守卫与请求前置判断复用。 */
export function hasBackendToken(): boolean {
  return !!getToken();
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as ApiEnvelope<{ token: string }> | null;
      if (!res.ok || !json?.success || !json.data?.token) return false;
      accessToken = json.data.token;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // 文件上传：不设置 Content-Type，浏览器自动带 boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BACKEND_URL}/api${path}`, {
    method,
    headers,
    body: payload,
    credentials: "include",
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!json) throw new BackendApiError("后端响应格式异常", res.status);
  if (!json.success) {
    if (res.status === 401 && retry && !path.startsWith("/auth/")) {
      setBackendToken(null);
      if (await refreshAccessToken()) return request<T>(method, path, body, false);
    }
    throw new BackendApiError(json.error || "请求失败", res.status);
  }
  return json.data as T;
}

export const backendApi = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),

  /** 登录/注册后保存 token */
  setToken: setBackendToken,
  refreshSession: refreshAccessToken,

  /** 免登录启动：恢复现有会话，首次访问则创建隔离访客空间。 */
  bootstrapSession: <T = unknown>() => request<T>("POST", "/auth/bootstrap", undefined, false),

  /** 文件上传（需求十：文件绑定 user_id 存后端） */
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<T>("POST", path, form);
  },

  /* ---------------- Phase 7.0.2 业务服务封装 ----------------
     前端页面统一经此后端通道调用，禁止直接读本地 mock / 业务逻辑。 */

  // 财富数据（资产全 CRUD）
  assets: {
    list: <T = unknown>() => request<T>("GET", "/assets"),
    create: <T = unknown>(body: unknown) => request<T>("POST", "/assets", body),
    update: <T = unknown>(id: string, body: unknown) => request<T>("PUT", `/assets/${id}`, body),
    remove: <T = unknown>(id: string) => request<T>("DELETE", `/assets/${id}`),
  },

  // Financial Twin
  twin: {
    recalculate: <T = unknown>() => request<T>("POST", "/twin/recalculate"),
    status: <T = unknown>() => request<T>("GET", "/twin/status"),
  },

  // AI CFO
  cfo: {
    analyze: <T = unknown>(question?: string) =>
      request<T>("POST", "/cfo/analyze", { question: question ?? "" }),
  },

  // RAG 知识检索
  rag: {
    query: <T = unknown>(question: string, topK = 5, answer = false) =>
      request<T>("POST", "/rag/query", { question, topK, answer }),
    ingest: <T = unknown>(body: unknown) => request<T>("POST", "/rag/ingest", body),
    chunks: <T = unknown>() => request<T>("GET", "/rag/chunks"),
  },

  // Agent 编排
  agent: {
    run: <T = unknown>(taskType: string, question?: string) =>
      request<T>("POST", "/agent/tasks", { task_type: taskType, question: question ?? "" }),
    list: <T = unknown>() => request<T>("GET", "/agent/tasks"),
    detail: <T = unknown>(id: string) => request<T>("GET", `/agent/tasks/${id}`),
  },

  // 财富监控
  monitor: {
    run: <T = unknown>() => request<T>("POST", "/monitor/run"),
  },

  // 文档解析提取
  documents: {
    analyze: <T = unknown>(documentId: string) =>
      request<T>("POST", "/documents/analyze", { documentId }),
    confirm: <T = unknown>(documentId: string, records: unknown[]) =>
      request<T>("POST", `/documents/${documentId}/confirm`, { records }),
  },

  /* ---------------- Phase 7.1 Wealth Intelligence ----------------
     财富实验室（/wealth-lab）的统一后端通道：预测 / 评分 / 事件模拟 / 方案对比 / 工作流 / 长期记忆 / AI CFO 对话。 */
  intelligence: {
    overview: <T = unknown>() => request<T>("GET", "/intelligence/overview"),
    events: <T = unknown>() => request<T>("GET", "/intelligence/events"),
    predict: <T = unknown>(body: unknown) =>
      request<T>("POST", "/intelligence/predict", body),
    score: <T = unknown>(persist = false) =>
      request<T>("GET", `/intelligence/score${persist ? "?persist=true" : ""}`),
    simulate: <T = unknown>(body: unknown) =>
      request<T>("POST", "/intelligence/simulate", body),
    compare: <T = unknown>(body: unknown) =>
      request<T>("POST", "/intelligence/compare", body),
    strategy: <T = unknown>(body: unknown) =>
      request<T>("POST", "/intelligence/strategy", body),
    workflow: <T = unknown>(body: unknown) =>
      request<T>("POST", "/intelligence/workflow", body),
    memories: <T = unknown>() => request<T>("GET", "/intelligence/memories"),
    chat: <T = unknown>(body: unknown) =>
      request<T>("POST", "/intelligence/chat", body),
  },

  /* ---------------- Phase 7.2 Multimodal Intelligence（多模态识别录入） ---------------- */
  multimodal: {
    capabilities: <T = unknown>() => request<T>("GET", "/multimodal/capabilities"),
    ingestText: <T = unknown>(text: string, useAi = true) =>
      request<T>("POST", "/multimodal/text", { text, useAi }),
    // 统一上传：图片 / 文件 / 音频自动判类型；支持显式 modality 与 useAi 覆盖
    upload: <T = unknown>(file: File, modality?: string, useAi = true) => {
      const form = new FormData();
      form.append("file", file);
      if (modality) form.append("modality", modality);
      form.append("useAi", String(useAi));
      return request<T>("POST", "/multimodal/upload", form);
    },
    speech: <T = unknown>(transcript: string, useAi = true, autoIngest = true) =>
      request<T>("POST", "/multimodal/speech", { transcript, useAi, autoIngest }),
    pending: <T = unknown>() => request<T>("GET", "/multimodal/pending"),
    confirm: <T = unknown>(ids: string[], edits?: Record<string, unknown>) =>
      request<T>("POST", "/multimodal/confirm", { ids, edits: edits ?? {} }),
    reject: <T = unknown>(ids: string[]) =>
      request<T>("POST", "/multimodal/reject", { ids }),
    inputs: <T = unknown>(limit = 20) =>
      request<T>("GET", `/multimodal/inputs?limit=${limit}`),
    inputDetail: <T = unknown>(id: string) =>
      request<T>("GET", `/multimodal/inputs/${id}`),
    deleteInput: <T = unknown>(id: string) =>
      request<T>("DELETE", `/multimodal/inputs/${id}`),
  },

  /* ---------------- Phase 7.2 Agent Ecosystem（智能体生态） ---------------- */
  agents: {
    market: <T = unknown>() => request<T>("GET", "/agents/market"),
    configure: <T = unknown>(name: string, body: unknown) =>
      request<T>("PUT", `/agents/market/${name}`, body),
    tools: <T = unknown>() => request<T>("GET", "/agents/tools"),
    callTool: <T = unknown>(tool: string, params: Record<string, unknown>) =>
      request<T>("POST", "/agents/tools/call", { tool, params }),
    run: <T = unknown>(name: string, question?: string, useAi = true) =>
      request<T>("POST", `/agents/run/${name}`, { question: question ?? "", useAi }),
    workflow: <T = unknown>(body: unknown) =>
      request<T>("POST", "/agents/workflow", body),
    runs: <T = unknown>(limit = 20) =>
      request<T>("GET", `/agents/runs?limit=${limit}`),
  },

  /* ---------------- Phase 7.2 Wealth Report（财富报告） ---------------- */
  report: {
    kinds: <T = unknown>() => request<T>("GET", "/reports/kinds"),
    // kind 必填（合法值由 /reports/kinds 返回：comprehensive/annual/life_plan/investment）
    generate: <T = unknown>(kind: string, useAi = true, persist = true) =>
      request<T>("POST", "/reports/generate", { kind, useAi, persist }),
    list: <T = unknown>(limit = 20) =>
      request<T>("GET", `/reports?limit=${limit}`),
    detail: <T = unknown>(id: string) =>
      request<T>("GET", `/reports/${id}`),
    remove: <T = unknown>(id: string) =>
      request<T>("DELETE", `/reports/${id}`),
  },

  /* ---------------- Phase 7.3 Personal OS（个人财富操作系统） ---------------- */
  personalOs: {
    // 财富数字分身
    avatar: <T = unknown>() => request<T>("GET", "/personal-os/avatar"),
    renameAvatar: <T = unknown>(avatarName: string) =>
      request<T>("POST", "/personal-os/avatar", { avatarName }),
    // 财富时间线
    timeline: <T = unknown>() => request<T>("GET", "/personal-os/timeline"),
    addTimelineEvent: <T = unknown>(body: unknown) =>
      request<T>("POST", "/personal-os/timeline/events", body),
    deleteTimelineEvent: <T = unknown>(id: string) =>
      request<T>("DELETE", `/personal-os/timeline/events/${id}`),
    // AI 记忆中心
    memory: <T = unknown>(kind?: string) =>
      request<T>("GET", `/personal-os/memory${kind ? `?kind=${kind}` : ""}`),
    addMemory: <T = unknown>(body: unknown) =>
      request<T>("POST", "/personal-os/memory", body),
    updateMemory: <T = unknown>(id: string, body: unknown) =>
      request<T>("PUT", `/personal-os/memory/${id}`, body),
    deleteMemory: <T = unknown>(id: string) =>
      request<T>("DELETE", `/personal-os/memory/${id}`),
    // AI CFO 驾驶舱
    commandCenter: <T = unknown>() => request<T>("GET", "/personal-os/command-center"),
    // 个人知识中心
    knowledge: <T = unknown>(params?: { category?: string; favorite?: boolean; q?: string }) => {
      const qs: string[] = [];
      if (params?.category) qs.push(`category=${encodeURIComponent(params.category)}`);
      if (params?.favorite !== undefined) qs.push(`favorite=${params.favorite}`);
      if (params?.q) qs.push(`q=${encodeURIComponent(params.q)}`);
      return request<T>("GET", `/personal-os/knowledge${qs.length ? `?${qs.join("&")}` : ""}`);
    },
    addKnowledge: <T = unknown>(body: unknown) =>
      request<T>("POST", "/personal-os/knowledge", body),
    updateKnowledge: <T = unknown>(id: string, body: unknown) =>
      request<T>("PUT", `/personal-os/knowledge/${id}`, body),
    toggleKnowledgeFavorite: <T = unknown>(id: string) =>
      request<T>("POST", `/personal-os/knowledge/${id}/favorite`),
    deleteKnowledge: <T = unknown>(id: string) =>
      request<T>("DELETE", `/personal-os/knowledge/${id}`),
    // 主动陪伴日报
    briefing: <T = unknown>() => request<T>("GET", "/personal-os/briefing"),
    regenerateBriefing: <T = unknown>() =>
      request<T>("POST", "/personal-os/briefing/generate"),
    // 决策记录
    decisions: <T = unknown>() => request<T>("GET", "/personal-os/decisions"),
    addDecision: <T = unknown>(body: unknown) =>
      request<T>("POST", "/personal-os/decisions", body),
    // 方案版本
    planVersions: <T = unknown>(subject?: string) =>
      request<T>("GET", `/personal-os/plan-versions${subject ? `?subject=${subject}` : ""}`),
    addPlanVersion: <T = unknown>(body: unknown) =>
      request<T>("POST", "/personal-os/plan-versions", body),
    // 全局搜索
    search: <T = unknown>(q: string) =>
      request<T>("GET", `/personal-os/search?q=${encodeURIComponent(q)}`),
    // 隐私中心
    exportData: <T = unknown>() => request<T>("GET", "/personal-os/privacy/export"),
    clearMemory: <T = unknown>() => request<T>("DELETE", "/personal-os/privacy/memory"),
  },

  /* ---------------- Phase 7.3 通知中心（/api/notifications） ---------------- */
  notifications: {
    list: <T = unknown>(params?: { category?: string; archived?: boolean; unread?: boolean }) => {
      const qs: string[] = [];
      if (params?.category) qs.push(`category=${encodeURIComponent(params.category)}`);
      if (params?.archived !== undefined) qs.push(`archived=${params.archived}`);
      if (params?.unread !== undefined) qs.push(`unread=${params.unread}`);
      return request<T>("GET", `/notifications${qs.length ? `?${qs.join("&")}` : ""}`);
    },
    create: <T = unknown>(body: unknown) => request<T>("POST", "/notifications", body),
    markRead: <T = unknown>(id: string) => request<T>("POST", `/notifications/${id}/read`),
    toggleArchive: <T = unknown>(id: string) => request<T>("POST", `/notifications/${id}/archive`),
    remove: <T = unknown>(id: string) => request<T>("DELETE", `/notifications/${id}`),
  },
};

/* ---------------- Phase 7.4 智能自动化 + AI 主动服务（/autonomous） ---------------- */
// 46 端点：控制中心 / 引导 / 扫描 / 洞察 / 成本 / 事件 / 规则 / 定时 / 工作流 /
// Webhook / 运行记录 / 行动中心 / 长期计划 / 偏好学习 / 市场数据。
// 约定：查询参数拼接在 path 之后；mutation body 经 request 透传。
export const backendApiAutonomous = {
  overview: <T = unknown>() => request<T>("GET", "/autonomous/overview"),
  bootstrap: <T = unknown>() => request<T>("POST", "/autonomous/bootstrap"),
  scan: <T = unknown>(runWorkflows = true) =>
    request<T>("POST", `/autonomous/scan?runWorkflows=${runWorkflows}`),
  insights: <T = unknown>(allowLlm = false) =>
    request<T>("GET", `/autonomous/insights?allowLlm=${allowLlm}`),
  cost: <T = unknown>() => request<T>("GET", "/autonomous/cost"),
  events: <T = unknown>(limit = 20) =>
    request<T>("GET", `/autonomous/events?limit=${limit}`),
  rules: {
    list: <T = unknown>() => request<T>("GET", "/autonomous/rules"),
    create: <T = unknown>(body: unknown) => request<T>("POST", "/autonomous/rules", body),
    update: <T = unknown>(id: string, body: unknown) =>
      request<T>("PUT", `/autonomous/rules/${id}`, body),
    remove: <T = unknown>(id: string) => request<T>("DELETE", `/autonomous/rules/${id}`),
    run: <T = unknown>(id: string) => request<T>("POST", `/autonomous/rules/${id}/run`),
  },
  schedules: {
    list: <T = unknown>() => request<T>("GET", "/autonomous/schedules"),
    create: <T = unknown>(body: unknown) => request<T>("POST", "/autonomous/schedules", body),
    update: <T = unknown>(id: string, body: unknown) =>
      request<T>("PUT", `/autonomous/schedules/${id}`, body),
    remove: <T = unknown>(id: string) => request<T>("DELETE", `/autonomous/schedules/${id}`),
    run: <T = unknown>(id: string, force = false) =>
      request<T>("POST", `/autonomous/schedules/${id}/run?force=${force}`),
  },
  workflows: {
    templates: <T = unknown>() => request<T>("GET", "/autonomous/workflows/templates"),
    list: <T = unknown>() => request<T>("GET", "/autonomous/workflows"),
    create: <T = unknown>(body: unknown) => request<T>("POST", "/autonomous/workflows", body),
    update: <T = unknown>(id: string, body: unknown) =>
      request<T>("PUT", `/autonomous/workflows/${id}`, body),
    remove: <T = unknown>(id: string) => request<T>("DELETE", `/autonomous/workflows/${id}`),
    run: <T = unknown>(id: string) => request<T>("POST", `/autonomous/workflows/${id}/run`),
  },
  webhooks: {
    list: <T = unknown>() => request<T>("GET", "/autonomous/webhooks"),
    create: <T = unknown>(body: unknown) => request<T>("POST", "/autonomous/webhooks", body),
    remove: <T = unknown>(id: string) => request<T>("DELETE", `/autonomous/webhooks/${id}`),
    test: <T = unknown>(id: string) => request<T>("POST", `/autonomous/webhooks/${id}/test`),
  },
  runs: {
    list: <T = unknown>(limit = 20) => request<T>("GET", `/autonomous/runs?limit=${limit}`),
  },
  actions: {
    list: <T = unknown>(status?: string) =>
      request<T>("GET", `/autonomous/actions${status ? `?status=${status}` : ""}`),
    create: <T = unknown>(body: unknown) => request<T>("POST", "/autonomous/actions", body),
    complete: <T = unknown>(id: string, feedback?: Record<string, unknown>) =>
      request<T>("POST", `/autonomous/actions/${id}/complete`, feedback ? { feedback } : undefined),
    dismiss: <T = unknown>(id: string, reason?: string) =>
      request<T>("POST", `/autonomous/actions/${id}/dismiss`, reason ? { reason } : undefined),
    defer: <T = unknown>(id: string, days = 7) =>
      request<T>("POST", `/autonomous/actions/${id}/defer`, { days }),
    reopen: <T = unknown>(id: string) => request<T>("POST", `/autonomous/actions/${id}/reopen`),
    remove: <T = unknown>(id: string) => request<T>("DELETE", `/autonomous/actions/${id}`),
    stats: <T = unknown>() => request<T>("GET", "/autonomous/actions/stats"),
  },
  plans: {
    list: <T = unknown>() => request<T>("GET", "/autonomous/plans"),
    create: <T = unknown>(body: unknown) => request<T>("POST", "/autonomous/plans", body),
    update: <T = unknown>(id: string, body: unknown) =>
      request<T>("PUT", `/autonomous/plans/${id}`, body),
    remove: <T = unknown>(id: string) => request<T>("DELETE", `/autonomous/plans/${id}`),
    run: <T = unknown>(id: string, force = false) =>
      request<T>("POST", `/autonomous/plans/${id}/run?force=${force}`),
  },
  preferences: {
    get: <T = unknown>() => request<T>("GET", "/autonomous/preferences"),
    learn: <T = unknown>() => request<T>("POST", "/autonomous/preferences/learn"),
    bias: <T = unknown>() => request<T>("GET", "/autonomous/preferences/bias"),
  },
  market: {
    price: <T = unknown>(symbol: string, marketType = "stock", force = false, ttl = 900) =>
      request<T>(
        "GET",
        `/autonomous/market/price?symbol=${encodeURIComponent(symbol)}&marketType=${marketType}&force=${force}&ttl=${ttl}`,
      ),
    history: <T = unknown>(symbol: string, days = 30, marketType = "stock") =>
      request<T>(
        "GET",
        `/autonomous/market/history?symbol=${encodeURIComponent(symbol)}&days=${days}&marketType=${marketType}`,
      ),
    portfolioChange: <T = unknown>() => request<T>("GET", "/autonomous/market/portfolio-change"),
  },
};
