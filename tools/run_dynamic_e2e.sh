#!/usr/bin/env bash
# ============================================================================
# tools/run_dynamic_e2e.sh -- Gate dinamico DYN-01..10 (Fase 1, bloqueante
# para cualquier commit que toque transacciones/persistencia/locks).
# Uso: bash tools/run_dynamic_e2e.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[DYN] Ejecutando suite dinamica E2E (harness hermetico)..."
if node --experimental-loader ./tools/wixLoader.mjs ./harness/runDyn.js; then
  echo "[DYN] PASS: suite dinamica completa (DYN-06 + DYN-07 incluidos)"
  exit 0
else
  CODE=$?
  echo "[DYN] FAIL: suite dinamica (exit code $CODE)"
  exit $CODE
fi
