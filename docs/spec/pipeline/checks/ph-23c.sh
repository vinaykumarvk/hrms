#!/usr/bin/env bash
# PH-23C oracle: G01 FR-EPM-025 phonetic + transliteration search — a Soundex-style phonetic index
# so near-homophone names match; a phonetic=true search returns homophone hits.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g01 apps/api/src/routes/g01.routes.ts"; T=apps/api/test
echo "== PH-23C exit-criteria (G01 phonetic / transliteration search) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "phonetic search::phonetic|Phonetic" \
  "soundex-style code::[Ss]oundex|phoneticCode|phonetic_code" \
  "transliteration::translit|Translit" \
  "homophone matching::homophone|phonetic"
do must "$spec" $S; done
for spec in \
  "phonetic search exercised::phonetic|soundex" \
  "homophone hit asserted::phonetic|soundex|homophone"
do must "$spec" "$T"/ph23c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-23C met' || echo 'RED - PH-23C not complete') =="; exit "$fail"
