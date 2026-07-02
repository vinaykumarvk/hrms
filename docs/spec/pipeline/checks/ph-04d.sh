#!/usr/bin/env bash
# PH-04D oracle (gate: human): API conformance and freeze packet — asserts REAL coverage.
# Re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md: the previous check
# accepted a self-written verdict with marker words. This oracle independently diffs the
# implemented route registry (parsed from kernel.register blocks in apps/api/src/routes/*.ts)
# against every operation in docs/contracts/openapi/*.yaml, prints per-contract coverage and
# drift, and requires docs/spec/ph-04-verdict.md to state the SAME numbers (honesty check).
# Full typecheck + test must pass. bash 3.2 / BSD grep compatible.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-04D exit-criteria (API conformance + freeze packet) =="

# --- 1. Independent registry-vs-contract diff -----------------------------------------------------
python3 - <<'PY' > /tmp/ph04d-coverage.txt 2>&1
import glob, re, sys
try:
    import yaml
except Exception:
    print("FAIL::pyyaml unavailable — cannot verify contract coverage"); sys.exit(0)
def impl_routes():
    routes = []
    for path in sorted(glob.glob("apps/api/src/routes/*.routes.ts")):
        src = open(path).read()
        for m in re.finditer(r'kernel\.register\(', src):
            i = m.end(); depth = 1
            while i < len(src) and depth > 0:
                c = src[i]
                if c == '(': depth += 1
                elif c == ')': depth -= 1
                i += 1
            block = src[m.end():i]
            mm = re.search(r'method:\s*"(GET|POST|PUT|PATCH|DELETE)"', block)
            pp = re.search(r'path:\s*"([^"]+)"', block)
            if mm and pp: routes.append((mm.group(1), pp.group(1)))
    return routes
def norm(p):
    p = re.sub(r'^/api/v1', '', p)
    return re.sub(r'\{[^}]+\}', '{}', p)
impl = set((m, norm(p)) for m, p in impl_routes())
if not impl:
    print("FAIL::no implemented routes parsed from apps/api/src/routes"); sys.exit(0)
contract = set(); total = 0; matched = 0
for f in sorted(glob.glob("docs/contracts/openapi/*.yaml")):
    try:
        doc = yaml.safe_load(open(f))
    except Exception as e:
        print("FAIL::cannot parse %s: %s" % (f, e)); continue
    name = f.split("/")[-1].replace(".yaml", "")
    t = 0; mt = 0
    for path, ops in (doc.get("paths") or {}).items():
        if not isinstance(ops, dict): continue
        for meth in ("get", "post", "put", "patch", "delete"):
            if meth in ops:
                key = (meth.upper(), norm(path)); contract.add(key); t += 1
                if key in impl: mt += 1
    total += t; matched += mt
    print("ROW::%s %d/%d operations implemented (%.1f%%)" % (name, mt, t, (100.0 * mt / t) if t else 0.0))
unmatched = sorted(r for r in impl if r not in contract)
for m, p in unmatched:
    print("DRIFT::implemented route not in any contract: %s %s" % (m, p))
print("COVERAGE::%.1f" % (round(100.0 * matched / total, 1) if total else 0.0))
print("UNMATCHED::%d" % len(unmatched))
PY
cov=""; unmatched=""
while IFS= read -r line; do
  case "$line" in
    ROW::*)       echo "  info ${line#ROW::}";;
    DRIFT::*)     echo "  info ${line#DRIFT::}";;
    COVERAGE::*)  cov="${line#COVERAGE::}";;
    UNMATCHED::*) unmatched="${line#UNMATCHED::}";;
    FAIL::*)      red "${line#FAIL::}";;
    *)            red "coverage script error: $line";;
  esac
done < /tmp/ph04d-coverage.txt
if [ -n "$cov" ]; then grn "contract coverage computed: ${cov}% of OpenAPI operations implemented"
else red "coverage could not be computed"; fi
[ -n "$unmatched" ] && echo "  info drift: ${unmatched} implemented route(s) not in any contract"

# --- 2. Honest verdict packet: numbers must match the oracle's own computation --------------------
v=docs/spec/ph-04-verdict.md
if [ -s "$v" ] && [ "$(wc -c < "$v")" -ge 1500 ]; then grn "verdict packet present: $v"
else red "missing/too-small verdict packet: $v"; fi
if [ -n "$cov" ] && grep -q "${cov}%" "$v" 2>/dev/null; then
  grn "verdict states the oracle-computed coverage (${cov}%)"
else red "verdict does not state the oracle-computed coverage ${cov}% — run this check and record its numbers"; fi
if [ -n "$unmatched" ] && grep -q "unmatched_implemented: ${unmatched}" "$v" 2>/dev/null; then
  grn "verdict states the oracle-computed drift count (unmatched_implemented: ${unmatched})"
else red "verdict missing 'unmatched_implemented: ${unmatched}' drift line"; fi
for mod in P01 G01 G02 G03 G04 G05 G06 G07 G08 G09 G10 G11 G12 G13 G14; do
  grep -q "$mod" "$v" 2>/dev/null && grn "verdict covers $mod" || red "verdict coverage table missing $mod"
done
grep -q '|' "$v" 2>/dev/null && grn "verdict contains a coverage table" || red "verdict has no coverage table"
grep -qiE 'gap|not implemented|missing' "$v" 2>/dev/null && grn "verdict names remaining gaps" || red "verdict does not name remaining gaps"

# --- 3. Full toolchain (RED on fail; RED if deps absent — freeze gate) ----------------------------
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test passes (full API suite)" || red "npm test failed"
else
  red "node_modules absent — PH-04D freeze requires a green typecheck+test run"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-04D met (human gate: review the packet)' || echo 'RED — PH-04D not complete') =="; exit $fail
