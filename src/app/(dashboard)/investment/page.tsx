// Phase 6.9 需求十一：/investment 投资中心入口。
// 项目历史路由为 /investments（Phase 6.4 起），此处做永久重定向保持两个路径可达。
import { redirect } from "next/navigation";

export default function InvestmentRedirectPage() {
  redirect("/investments");
}
