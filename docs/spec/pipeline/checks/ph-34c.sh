#!/usr/bin/env bash
# PH-34C oracle: G01 privacy/DPDP console UI — a real controlled web surface using the injected client + canonical states.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
COMP="apps/web/src/modules/g01/PrivacyConsole.tsx"; CLIENT="apps/web/src/api/hrmsClient.ts"; FIX="apps/web/src/api/fixtureHrmsClient.ts"; APP="apps/web/src/App.tsx"
echo "== PH-34C exit-criteria (G01 privacy/DPDP console UI) =="
[ -d node_modules ] || red "node_modules absent"
[ -f "$COMP" ] && grn "component present: $COMP" || red "missing component: $COMP"
have "$COMP" 'onSubmit=|onClick=' "component has a submit/click handler"
have "$COMP" 'useState' "component uses controlled state"
have "$COMP" 'listMyRightsRequests' "component calls client.listMyRightsRequests"
have "$COMP" 'OperationalState|"loading"|"error"|"empty"' "component renders canonical states"
have "$CLIENT" 'listMyRightsRequests' "client exposes listMyRightsRequests"
have "$FIX" 'listMyRightsRequests' "fixture implements listMyRightsRequests"
have "$APP" 'PrivacyConsole' "surface mounted in App"
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "api typecheck green" || red "api typecheck failed"
  npm run -s web:typecheck >/dev/null 2>&1 && grn "web typecheck green" || red "web typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
  npm run -s web:test >/dev/null 2>&1 && grn "web:test green" || red "web:test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-34C met' || echo 'RED - PH-34C not complete') =="; exit "$fail"
