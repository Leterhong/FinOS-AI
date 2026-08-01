import { scenarios } from "@/scenario/scenario-engine";

/** UI 友好的 Life Event 元数据（供 Twin 页 / 工作流展示）。 */
export interface LifeEventMeta {
  id: string;
  label: string;
  icon: string;
  description: string;
  plannerHint: string;
}

export const lifeEvents: LifeEventMeta[] = Object.values(scenarios).map((s) => ({
  id: s.id,
  label: s.label,
  icon: s.icon,
  description: s.description,
  plannerHint: s.plannerHint,
}));

export function getEventMeta(id: string): LifeEventMeta | undefined {
  return lifeEvents.find((e) => e.id === id);
}
