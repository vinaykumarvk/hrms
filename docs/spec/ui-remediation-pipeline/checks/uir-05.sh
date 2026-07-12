#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
echo "== UIR-05 design system and harness oracle =="
for f in apps/web/src/styles/tokens.css apps/web/src/components/ui/Button.tsx apps/web/src/components/ui/Input.tsx apps/web/src/components/ui/Alert.tsx apps/web/src/components/ui/Dialog.tsx apps/web/src/components/ui/Drawer.tsx apps/web/playwright.config.ts; do need_file "$f" 180; done
run node --test apps/web/test/ui-remediation-primitives.test.cjs
run npm run web:typecheck
run npm run web:build
run npm run web:test
run npm run web:test:e2e -- --project=chromium
finish
