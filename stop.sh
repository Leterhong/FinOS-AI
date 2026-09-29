#!/usr/bin/env bash
# FinOS AI 服务停止脚本（Web 3000 + API 8300）。
#
# 通过 ss 提取监听端口的 PID 后终止，不使用 fuser/lsof（不一定存在），
# 也不对 ss 追加 2>/dev/null（避免 ss 缺失时被静默吞掉）。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

WEB_PORT=3000
API_PORT=8300
RUN_DIR="$ROOT/.run"

# 从 ss 输出中提取监听指定端口的进程 PID 列表（去重）。
collect_pids() {
  ss -ltnp | awk -v p=":$1" '
    $4 ~ p"$" {
      line = $0
      while (match(line, /pid=[0-9]+/)) {
        print substr(line, RSTART + 4, RLENGTH - 4)
        line = substr(line, RSTART + RLENGTH)
      }
    }
  ' | sort -u
}

stop_port() {
  local port="$1"
  local pids
  pids="$(collect_pids "$port")"
  if [ -z "$pids" ]; then
    echo "端口 $port 未发现监听进程。"
    return 0
  fi
  for pid in $pids; do
    echo "终止端口 $port 上的进程 $pid"
    kill "$pid"
  done
  # 最多等待 10 秒优雅退出，之后强制终止。
  for _ in $(seq 1 10); do
    if [ -z "$(collect_pids "$port")" ]; then
      return 0
    fi
    sleep 1
  done
  for pid in $(collect_pids "$port"); do
    echo "进程 $pid 未响应，强制终止"
    kill -9 "$pid"
  done
  return 0
}

stop_port "$WEB_PORT"
stop_port "$API_PORT"

# 清理记录的进程 PID 文件（进程已由端口清理覆盖）。
for name in web backend; do
  pid_file="$RUN_DIR/$name.pid"
  if [ -f "$pid_file" ]; then
    saved_pid="$(cat "$pid_file")"
    if [ -n "$saved_pid" ] && kill -0 "$saved_pid" 2>/dev/null; then
      kill "$saved_pid" 2>/dev/null || true
    fi
    : > "$pid_file"
  fi
done

echo "服务已停止。"
