#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
echo "== UIR-04 UI-supporting API oracle =="
need_file docs/spec/ui-remediation/uir-04-disposition.yaml 120
run node --test apps/api/test/ui-remediation-api.test.cjs
run npm run typecheck
finish
