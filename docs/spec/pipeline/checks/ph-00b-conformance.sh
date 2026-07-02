#!/usr/bin/env bash
# Focused PH-00B executable conformance proof.
# Runs the additive PUDA P01 facade tests plus an existing queue-routing golden smoke.
set -uo pipefail

PUDA="/Users/n15318/PUDA_workflow_engine"
NODE20="$HOME/.nvm/versions/node/v20.11.1/bin"
if [ -x "$NODE20/node" ]; then
  PATH="$NODE20:$PATH"
fi

CONFIG="/tmp/hrms-ph00b-vitest.config.mjs"
cat > "$CONFIG" <<'EOF'
export default {
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    testTimeout: 45000,
    hookTimeout: 45000,
    fileParallelism: false,
    maxWorkers: 1
  }
}
EOF

node "$PUDA/node_modules/vitest/vitest.mjs" run \
  src/p01-workflow-facade.test.ts \
  src/work-queues.test.ts \
  --root "$PUDA/apps/api" \
  --config "$CONFIG" \
  --reporter=verbose
