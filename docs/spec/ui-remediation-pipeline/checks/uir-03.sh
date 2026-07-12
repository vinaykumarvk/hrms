#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
echo "== UIR-03 service semantics oracle =="
need_file docs/spec/ui-remediation/uir-03-disposition.yaml 120
run node --test apps/api/test/ui-remediation-service.test.cjs
run npm run typecheck
finish
