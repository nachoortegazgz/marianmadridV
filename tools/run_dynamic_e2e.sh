#!/usr/bin/env bash
# BATERIA DINAMICA E2E v5010.5 - mocks hermeticos via loader ESM in-process.
cd "$(dirname "$0")/.." || exit 99
node --no-warnings --experimental-loader ./tools/wixLoader.mjs \
  tools/dynE2eBootstrap.mjs src/backend/__tests__/dynamic.e2e.test.js
