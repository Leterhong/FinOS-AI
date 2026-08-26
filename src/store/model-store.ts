"use client";

import { create } from "zustand";
import type {
  PublicProviderConfig,
  ActiveModelSummary,
  ModelHealth,
  ModelTestResult,
  PlaygroundResult,
  ProviderConfigInput,
} from "@/ai/model-center/types";
import { ensureWorkspaceSession } from "@/lib/workspace-session";

// AI 模型中心 Store（Phase 5.5）。浏览器仅通过 fetch 调用 /api/models/*，
// API Key 明文只在提交时短暂传输，服务端加密保存，前端仅持有掩码。

interface ModelState {
  userId: string;
  models: PublicProviderConfig[];
  active: ActiveModelSummary | null;
  health: ModelHealth[];

  isLoading: boolean;
  isSaving: boolean;
  isTesting: string | null; // 正在测试的模型 id（或 "draft"）
  testResult: ModelTestResult | null;
  playgroundResult: PlaygroundResult | null;
  isPlaygroundRunning: boolean;
  error: string | null;

  setUserId: (userId: string) => void;
  loadModels: (userId?: string) => Promise<void>;
  loadActive: (userId?: string) => Promise<void>;
  addModel: (input: ProviderConfigInput) => Promise<PublicProviderConfig | null>;
  updateModel: (id: string, input: Partial<ProviderConfigInput>) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  setDefaultModel: (id: string) => Promise<void>;
  testModel: (id: string) => Promise<ModelTestResult | null>;
  testDraft: (input: ProviderConfigInput) => Promise<ModelTestResult | null>;
  runPlayground: (question: string, modelId?: string) => Promise<void>;
  clearTestResult: () => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  userId: "default-user",
  models: [],
  active: null,
  health: [],
  isLoading: false,
  isSaving: false,
  isTesting: null,
  testResult: null,
  playgroundResult: null,
  isPlaygroundRunning: false,
  error: null,

  setUserId: (userId) => set({ userId }),

  loadModels: async (userId) => {
    const uid = userId ?? get().userId;
    set({ isLoading: true, error: null });
    try {
      await ensureWorkspaceSession();
      const res = await fetch(`/api/models?userId=${encodeURIComponent(uid)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载模型失败");
      set({
        models: data.models ?? [],
        active: data.active ?? null,
        isLoading: false,
      });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : "加载模型失败" });
    }
  },

  loadActive: async (userId) => {
    const uid = userId ?? get().userId;
    try {
      await ensureWorkspaceSession();
      const res = await fetch(`/api/models/active?userId=${encodeURIComponent(uid)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载模型状态失败");
      set({ active: data.active ?? null, health: data.health ?? [] });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "加载模型状态失败" });
    }
  },

  addModel: async (input) => {
    const uid = get().userId;
    set({ isSaving: true, error: null });
    try {
      await ensureWorkspaceSession();
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, userId: uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "添加失败");
      await get().loadModels();
      set({ isSaving: false });
      return data.model as PublicProviderConfig;
    } catch (e) {
      set({ isSaving: false, error: e instanceof Error ? e.message : "添加失败" });
      return null;
    }
  },

  updateModel: async (id, input) => {
    const uid = get().userId;
    set({ isSaving: true, error: null });
    try {
      await ensureWorkspaceSession();
      const res = await fetch(`/api/models/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, userId: uid }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "更新失败");
      }
      await get().loadModels();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "更新失败" });
    } finally {
      set({ isSaving: false });
    }
  },

  deleteModel: async (id) => {
    const uid = get().userId;
    try {
      await ensureWorkspaceSession();
      const res = await fetch(
        `/api/models/${id}?userId=${encodeURIComponent(uid)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "删除失败");
      }
      await get().loadModels();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "删除失败" });
    }
  },

  setDefaultModel: async (id) => {
    const uid = get().userId;
    try {
      await ensureWorkspaceSession();
      const res = await fetch(`/api/models/${id}/default`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "切换失败");
      }
      await get().loadModels();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "切换失败" });
    }
  },

  testModel: async (id) => {
    const uid = get().userId;
    set({ isTesting: id, testResult: null, error: null });
    try {
      await ensureWorkspaceSession();
      const res = await fetch(`/api/models/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "测试失败");
      set({ isTesting: null, testResult: data.result ?? null });
      await get().loadModels();
      return data.result as ModelTestResult;
    } catch (e) {
      set({ isTesting: null, error: e instanceof Error ? e.message : "测试失败" });
      return null;
    }
  },

  testDraft: async (input) => {
    set({ isTesting: "draft", testResult: null, error: null });
    try {
      await ensureWorkspaceSession();
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "测试失败");
      set({ isTesting: null, testResult: data.result ?? null });
      return data.result as ModelTestResult;
    } catch (e) {
      set({ isTesting: null, error: e instanceof Error ? e.message : "测试失败" });
      return null;
    }
  },

  runPlayground: async (question, modelId) => {
    const uid = get().userId;
    set({ isPlaygroundRunning: true, playgroundResult: null, error: null });
    try {
      await ensureWorkspaceSession();
      const res = await fetch("/api/models/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, question, modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "运行失败");
      set({ isPlaygroundRunning: false, playgroundResult: data.result ?? null });
    } catch (e) {
      set({
        isPlaygroundRunning: false,
        error: e instanceof Error ? e.message : "运行失败",
      });
    }
  },

  clearTestResult: () => set({ testResult: null }),
}));
