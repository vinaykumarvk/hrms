#!/usr/bin/env bash
# PH-26A oracle: G13 FR-008 OCR extraction engine — an OcrProvider interface + a concrete extractor
# that produces text from a document payload (not caller-supplied); unsupported format rejected.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g13"; T=apps/api/test
echo "== PH-26A exit-criteria (G13 OCR extraction engine) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "OCR provider interface::OcrProvider|ocrProvider|OcrEngine" \
  "concrete extractor::extract|Extractor|extractText" \
  "extraction not caller-supplied::extract|provider|engine" \
  "unsupported-format guard::UNSUPPORTED|unsupported|VALIDATION_FAILED"
do must "$spec" $S; done
for spec in \
  "OCR extraction exercised::extract|OcrProvider|ocrProvider" \
  "NEGATIVE: unsupported format rejected::UNSUPPORTED|VALIDATION_FAILED|unsupported"
do must "$spec" "$T"/ph26a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-26A met' || echo 'RED - PH-26A not complete') =="; exit "$fail"
