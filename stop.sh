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

# 从监听信息中提取指定端口的进程 PID 列表（去重）。优先 ss，其次 lsof/fuser。
collect_pids() {
  local port="$1" pids=""
  if command -v ss >/dev/null 2>&1; then
    pids="$(ss -ltnp 2>/dev/null | awk -v p=":$port" '
      $4 ~ p"$" {
        line = $0
        while (match(line, /pid=[0-9]+/)) {
          print substr(line, RSTART + 4, RLENGTH - 4)
          line = substr(line, RSTART + RLENGTH)
        }
      }
    ' | sort -u)"
  fi
  if [ -z "$pids" ] && command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u)"
  fi
  if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
    pids="$(fuser -n tcp "$port" 2>/dev/null | tr -s ' ' '\n' | tr -d '[:space:]' | grep -E '^[0-9]+$' | sort -u)"
  fi
  # 最后回退到 PID 文件。
  if [ -z "$pids" ]; then
    for name in web backend; do
      local pid_file="$RUN_DIR/$name.pid"
      if [ -f "$pid_file" ]; then
        local saved
        saved="$(cat "$pid_file" 2>/dev/null | tr -d '[:space:]')"
        if [ -n "$saved" ] && kill -0 "$saved" 2>/dev/null; then
          pids="$pids $saved"
        fi
      fi
    done
    pids="$(printf '%s\n' $pids | sort -u)"
  fi
  printf '%s' "$pids"
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
    kill "$pid" 2>/dev/null || true
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
    kill -9 "$pid" 2>/dev/null || true
  done
  sleep 1
  if [ -n "$(collect_pids "$port")" ]; then
    echo "端口 $port 仍有进程监听，停止失败。" >&2
    return 1
  fi
  return 0
}

STATUS=0
stop_port "$WEB_PORT" || STATUS=1
stop_port "$API_PORT" || STATUS=1

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

if [ "$STATUS" -eq 0 ]; then
  echo "服务已停止。"
else
  echo "服务停止不完整，请检查残留进程。" >&2
fi
exit "$STATUS"
