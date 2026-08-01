/**
 * Financial Data Connectors —— 数据源连接器注册表。
 * 每个连接器描述一类数据来源的接入规则：
 *   接受的文件格式、产出的数据种类（交易 / 持仓 / 保单）、默认方向语义。
 * 未来接入开放银行 / 券商 API 时，在此扩展 fetch 型连接器。
 * 纯声明式配置，客户端 / 服务端共享。
 */

import type { FileFormat, ImportSource } from "../types";

/** 连接器产出的数据种类 */
export type ConnectorOutput = "transactions" | "holdings" | "policy";

export interface ConnectorSpec {
  source: ImportSource;
  /** 中文显示名 */
  label: string;
  /** 说明文案 */
  description: string;
  /** 接受的文件格式 */
  formats: FileFormat[];
  /** 产出数据种类 */
  output: ConnectorOutput;
  /** 上传控件 accept 属性 */
  accept: string;
}

export const CONNECTORS: ConnectorSpec[] = [
  {
    source: "bank-csv",
    label: "银行流水",
    description: "银行 App / 网银导出的交易流水（CSV / Excel）",
    formats: ["csv", "xlsx", "txt", "json"],
    output: "transactions",
    accept: ".csv,.xlsx,.txt,.json",
  },
  {
    source: "credit-card",
    label: "信用卡账单",
    description: "信用卡月度账单明细（CSV / Excel）",
    formats: ["csv", "xlsx", "txt", "json"],
    output: "transactions",
    accept: ".csv,.xlsx,.txt,.json",
  },
  {
    source: "salary",
    label: "工资收入记录",
    description: "工资 / 奖金入账记录（CSV / Excel）",
    formats: ["csv", "xlsx", "txt", "json"],
    output: "transactions",
    accept: ".csv,.xlsx,.txt,.json",
  },
  {
    source: "fund",
    label: "基金持仓",
    description: "基金账户持仓导出文件（CSV / Excel）",
    formats: ["csv", "xlsx", "json"],
    output: "holdings",
    accept: ".csv,.xlsx,.json",
  },
  {
    source: "stock",
    label: "股票持仓",
    description: "券商账户持仓导出文件（CSV / Excel）",
    formats: ["csv", "xlsx", "json"],
    output: "holdings",
    accept: ".csv,.xlsx,.json",
  },
  {
    source: "insurance-pdf",
    label: "保险合同",
    description: "保险合同 PDF（自动抽取保额 / 保费 / 险种）",
    formats: ["pdf"],
    output: "policy",
    accept: ".pdf",
  },
];

export function getConnector(source: ImportSource): ConnectorSpec {
  const spec = CONNECTORS.find((c) => c.source === source);
  if (!spec) {
    throw new Error(`未知数据源: ${source}`);
  }
  return spec;
}
