#!/usr/bin/env bash
set -uo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }
run(){ "$@" && grn "$*" || red "$*"; }
finish(){ echo "== $([ "$fail" -eq 0 ] && echo GREEN || echo RED) =="; exit "$fail"; }
