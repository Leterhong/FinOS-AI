import type { KnowledgeCategory } from "../types";

/** 种子知识文档：随代码内置的公共金融知识（Markdown 内容）。 */
export interface SeedDocument {
  title: string;
  category: KnowledgeCategory;
  content: string;
}
