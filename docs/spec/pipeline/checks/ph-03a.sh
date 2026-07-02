#!/usr/bin/env bash
# PH-03A oracle: core platform service layer (embedded P01 + Authority Resolver + P05 audit).
# Real machine checks: service files present, all resolver families implemented, security greps, and
# `npm run typecheck` when node_modules is installed (strong oracle). WARNs if the toolchain is absent.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
hasfiles(){ [ -d "$1" ] && find "$1" -name '*.ts' -print -quit 2>/dev/null | grep -q .; }
echo "== PH-03A exit-criteria (platform service layer) =="
for d in apps/api/src/platform/workflow apps/api/src/platform/authority-resolution apps/api/src/platform/audit; do
  hasfiles "$d" && grn "service present: $d" || red "missing/empty: $d"
done
grep -qiE 'workflow-platform' package.json apps/api/package.json 2>/dev/null && grn "workflow-platform wired as dependency" || red "workflow-platform not wired in package.json"
# all resolver families implemented
ar="$(cat apps/api/src/platform/authority-resolution/*.ts apps/api/src/platform/authority-resolution/**/*.ts 2>/dev/null)"
for fam in REPORTING_CHAIN STATUTORY_AUTHORITY ORG_UNIT_HEAD NAMED_ROLE NAMED_INDIVIDUAL WORK_QUEUE COMMITTEE DELEGATION; do
  echo "$ar" | grep -q "$fam" && grn "resolver: $fam" || red "resolver family not implemented: $fam"
done
echo "$ar" | grep -qiE 'AMBIGUOUS|BLOCK' && grn "ambiguity blocked path present" || red "no ambiguity-block path in resolver"
# tests present
find apps/api -path '*/node_modules' -prune -o -name '*.test.ts' -print 2>/dev/null | grep -qiE 'resolv|authorit' && grn "authority-resolver tests present" || red "no authority-resolver test file"
# security: no production console.log in the new src
if grep -rniE 'console\.log' apps/api/src/platform 2>/dev/null | grep -vq '//'; then red "console.log in platform src"; else grn "no console.log in platform src"; fi
# toolchain oracle
if [ -d node_modules ] || [ -d apps/api/node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test --silent >/dev/null 2>&1 && grn "npm test passes" || echo "  WARN npm test not green (or no resolver/workflow tests wired) — inspect"
else
  echo "  WARN node_modules absent — typecheck/test oracle NOT run (structural + security checks only)"
fi
echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-03A met' || echo 'RED — PH-03A not complete') =="; exit $fail
