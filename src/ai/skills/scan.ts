import { inspectPrompt } from "@/security/prompt-guard";

/**
 * 上传技能的风险扫描（提示性）。
 * 目的：在导入用户上传的技能时提示潜在的提示词注入、命令执行、凭据外传等风险，
 * 由用户决定是否坚持导入；扫描结果不阻断导入。
 */
export interface SkillRisk {
  id: string;
  severity: "high" | "medium";
  label: string;
  evidence: string;
}

const PATTERNS: Array<{ id: string; severity: SkillRisk["severity"]; label: string; pattern: RegExp }> = [
  { id: "instruction_override", severity: "high", label: "疑似覆盖/忽略系统指令（提示词注入）", pattern: /ignore\s+(all\s+)?(previous|prior|above)/i },
  { id: "instruction_override_cn", severity: "high", label: "疑似覆盖/忽略系统指令（中文）", pattern: /忽略.{0,8}(之前|以上|系统|全部)/ },
  { id: "reveal_secret", severity: "high", label: "疑似要求泄露系统提示或密钥", pattern: /(reveal|print|输出).{0,20}(system\s*prompt|系统提示|api\s*key|密钥|环境变量|token)/i },
  { id: "shell_pipe", severity: "high", label: "疑似下载并执行远程脚本", pattern: /(curl|wget)\b[^\n]{0,80}\|\s*(sh|bash|zsh)/i },
  { id: "destructive", severity: "high", label: "疑似破坏性系统命令", pattern: /\b(rm\s+-rf|mkfs|dd\s+if=|shutdown|reboot|:\(\)\s*\{)/i },
  { id: "eval_exec", severity: "medium", label: "疑似动态执行代码", pattern: /\b(eval|exec|child_process|spawn)\s*\(/i },
  { id: "env_access", severity: "medium", label: "疑似读取进程环境变量/密钥", pattern: /process\.env\b|os\.environ/i },
  { id: "exfil_webhook", severity: "high", label: "疑似数据外传（webhook/隧道地址）", pattern: /(webhook|ngrok|requestbin|pipedream|burpcollaborator)/i },
  { id: "credential_literal", severity: "medium", label: "疑似硬编码凭据", pattern: /\b(sk-[a-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,})\b/i },
  { id: "jailbreak", severity: "high", label: "疑似越狱指令", pattern: /jailbreak|越狱|developer\s*mode|开发者模式/i },
];

export function scanSkillContent(text: string): SkillRisk[] {
  const risks: SkillRisk[] = [];
  for (const item of PATTERNS) {
    const match = item.pattern.exec(text);
    if (match) risks.push({ id: item.id, severity: item.severity, label: item.label, evidence: match[0].slice(0, 80) });
  }
  const flags = inspectPrompt(text);
  if (flags.includes("instruction_override") && !risks.some((r) => r.id === "instruction_override")) {
    risks.push({ id: "instruction_override", severity: "high", label: "疑似覆盖系统指令（提示词防护命中）", evidence: "" });
  }
  if (flags.includes("tool_escalation")) {
    risks.push({ id: "tool_escalation", severity: "high", label: "疑似越权工具调用/危险操作指令", evidence: "" });
  }
  // 去重
  const seen = new Set<string>();
  return risks.filter((risk) => {
    if (seen.has(risk.id)) return false;
    seen.add(risk.id);
    return true;
  });
}
