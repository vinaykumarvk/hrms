#!/usr/bin/env bash
# PH-02A oracle: the authority resolver MODEL + contract. GREEN only if the model parses, defines resolver
# types, every resolver_family referenced by the trigger map is a defined resolver type (0 dangling),
# G03/G05 are covered + bound, and the historical-correction snapshot rule is stated.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }
echo "== PH-02A exit-criteria (resolver model & contract) =="
need_file docs/spec/hrms-authority-model.yaml 800
need_file docs/spec/authority-resolution-contract.yaml 300
python3 - <<'PY' || red "authority model/contract invalid or incomplete"
import yaml,sys
try:
    m=yaml.safe_load(open("docs/spec/hrms-authority-model.yaml"))
    yaml.safe_load(open("docs/spec/authority-resolution-contract.yaml"))
except Exception as e:
    print("  RED  parse error:",e); sys.exit(1)
rt=set((m.get("resolver_types") or {}).keys())
if not rt: print("  RED  resolver_types empty"); sys.exit(1)
mods=((m.get("state_machine_trigger_map") or {}).get("modules")) or {}
if not isinstance(mods,dict) or not mods:
    print("  RED  state_machine_trigger_map.modules empty"); sys.exit(1)
# every resolver_family referenced by a module must be a defined resolver type (0 dangling)
fams=set()
for mod,spec in mods.items():
    for f in ((spec or {}).get("resolver_families") or []): fams.add(f)
dangling=fams - rt
if dangling: print("  RED  trigger map references undefined resolver types:",sorted(dangling)); sys.exit(1)
# the vertical-slice modules must be covered by the trigger map
for mod in ("G03","G05"):
    if mod not in mods: print(f"  RED  trigger map does not cover {mod}"); sys.exit(1)
vb=m.get("vertical_slice_bindings") or {}
if not {"G03_leave","G05_transfer"}.issubset(vb):
    print("  RED  vertical_slice_bindings missing G03_leave/G05_transfer"); sys.exit(1)
if not m.get("snapshot_rule"):
    print("  RED  snapshot_rule (historical-correction determinism) not stated"); sys.exit(1)
print(f"  ok   resolver_types={sorted(rt)}")
print(f"  ok   {len(mods)} modules mapped; {len(fams)} resolver families, all defined; G03/G05 covered+bound; snapshot_rule present")
sys.exit(0)
PY
echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-02A met' || echo 'RED — PH-02A not complete') =="; exit $fail
