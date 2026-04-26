#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

exec bun test \
  examples/observatory/observatory.test.ts \
  examples/observatory/parity.test.ts \
  examples/observatory/observatory-golden.test.ts \
  examples/observatory/protocol.test.ts \
  examples/observatory/snapshot-loader.test.ts \
  examples/observatory/playback-actions.test.ts \
  examples/observatory/export.test.ts
