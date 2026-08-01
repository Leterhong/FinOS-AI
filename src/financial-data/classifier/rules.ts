/**
 * 交易分类规则引擎 —— 关键词命中，纯函数共享。
 * 命中返回 category + confidence，未命中返回 null 交给 LLM 兜底。
 */

import type { TransactionCategory, TransactionDirection } from "../types";

interface Rule {
  category: TransactionCategory;
  keywords: string[];
  /** 限定方向（可选） */
  direction?: TransactionDirection;
  confidence: number;
}

const RULES: Rule[] = [
  // ---- 收入 ----
  {
    category: "salary",
    keywords: ["工资", "薪资", "薪酬", "代发工资", "工资入账", "salary", "payroll", "月薪"],
    direction: "income",
    confidence: 0.98,
  },
  {
    category: "bonus",
    keywords: ["奖金", "年终奖", "绩效", "提成", "bonus", "补贴", "报销"],
    direction: "income",
    confidence: 0.92,
  },
  // ---- 房租房贷 ----
  {
    category: "rent",
    keywords: ["房租", "租金", "房贷", "按揭", "住房贷款", "物业费", "rent", "mortgage", "链家", "自如", "贝壳"],
    confidence: 0.95,
  },
  // ---- 餐饮 ----
  {
    category: "dining",
    keywords: [
      "餐饮", "美团", "饿了么", "外卖", "餐厅", "食堂", "麦当劳", "肯德基", "星巴克", "瑞幸",
      "咖啡", "火锅", "海底捞", "奶茶", "喜茶", "蜜雪冰城", "烧烤", "面馆", "早餐", "午餐", "晚餐",
    ],
    confidence: 0.93,
  },
  // ---- 交通 ----
  {
    category: "transport",
    keywords: [
      "滴滴", "打车", "出租车", "地铁", "公交", "高铁", "火车票", "12306", "加油", "中石化",
      "中石油", "停车", "高速", "etc", "航空", "机票", "共享单车", "哈啰",
    ],
    confidence: 0.93,
  },
  // ---- 购物 ----
  {
    category: "shopping",
    keywords: [
      "淘宝", "天猫", "京东", "拼多多", "抖音电商", "唯品会", "苏宁", "超市", "便利店",
      "商场", "百货", "网购", "山姆", "盒马", "优衣库", "服饰", "数码",
    ],
    confidence: 0.9,
  },
  // ---- 生活缴费 ----
  {
    category: "utilities",
    keywords: ["水费", "电费", "燃气费", "煤气", "话费", "宽带", "流量", "中国移动", "中国联通", "中国电信", "缴费"],
    confidence: 0.93,
  },
  // ---- 娱乐 ----
  {
    category: "entertainment",
    keywords: ["电影", "猫眼", "淘票票", "游戏", "steam", "腾讯视频", "爱奇艺", "优酷", "网易云", "qq音乐", "b站", "哔哩哔哩", "ktv", "健身"],
    confidence: 0.9,
  },
  // ---- 医疗 ----
  {
    category: "medical",
    keywords: ["医院", "药店", "药房", "诊所", "体检", "挂号", "医保", "牙科", "口腔"],
    confidence: 0.93,
  },
  // ---- 教育 ----
  {
    category: "education",
    keywords: ["学费", "培训", "课程", "教育", "书店", "考试", "网课", "得到", "知识星球"],
    confidence: 0.9,
  },
  // ---- 投资 ----
  {
    category: "investment",
    keywords: [
      "基金", "申购", "赎回", "定投", "理财", "余额宝", "零钱通", "股票", "证券", "买入",
      "国债", "债券", "黄金", "招商证券", "中信证券", "华泰证券", "天天基金", "蚂蚁财富", "转入理财",
    ],
    confidence: 0.92,
  },
  // ---- 保险 ----
  {
    category: "insurance",
    keywords: ["保险", "保费", "人寿", "平安", "太平洋保险", "泰康", "友邦", "保单"],
    confidence: 0.92,
  },
  // ---- 贷款 ----
  {
    category: "loan",
    keywords: ["还款", "贷款", "借呗", "花呗", "白条", "分期", "信用卡还款", "消费贷", "京东金融还款"],
    confidence: 0.92,
  },
  // ---- 转账 ----
  {
    category: "transfer",
    keywords: ["转账", "红包", "微信转账", "支付宝转账", "亲属卡", "transfer"],
    confidence: 0.85,
  },
];

export interface RuleHit {
  category: TransactionCategory;
  confidence: number;
}

/**
 * 规则分类：拼接商户 + 描述 + 原始类型做关键词匹配。
 * 未命中返回 null。
 */
export function classifyByRule(
  text: string,
  direction: TransactionDirection,
): RuleHit | null {
  const s = text.toLowerCase();
  if (!s.trim()) return null;

  for (const rule of RULES) {
    if (rule.direction && rule.direction !== direction) continue;
    if (rule.keywords.some((k) => s.includes(k.toLowerCase()))) {
      return { category: rule.category, confidence: rule.confidence };
    }
  }

  // 收入方向未命中 → 默认奖金类附加收入（低置信度）
  if (direction === "income") {
    return { category: "bonus", confidence: 0.4 };
  }
  return null;
}
