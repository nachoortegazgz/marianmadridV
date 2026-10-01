# FASE 2 — validation.js + HOOKS §13 + ERRADICACION ALIAS COLLECTIONS

Estado: VERDE
Commits consolidados: c33f6f9 (baseline) · a758cd3 (FASE1-P0) · ed7a98e (staging validacion.js) · 900f85b (canonical V20.1) · test-migration final (este commit)

## Diff (git diff --stat real del cierre)
src/backend/__tests__/audit.e2e.js               |  82 +++++++++-------
src/backend/__tests__/professional.testRunner.js |  19 ++--
src/backend/__tests__/unit.testRunner.js         | 117 ++++++++++++++---------
src/backend/internalConfig.js                    |   2 +
src/backend/tests/audit.e2e.runner.mjs           |  13 +++
src/backend/tests/unit.testRunner.runner.mjs     |  40 ++++++++
6 files changed, 186 insertions(+), 87 deletions(-)

## Verificaciones (salidas literales, ejecutadas 02/10/2026)
- grep -nE "\bCOLLECTIONS\b" src/backend/internalConfig.js -> solo comentario de erradicacion (linea 70). USOS ACTIVOS: 0
- grep -rn "UNPAID" src/backend/internalConfig.js -> 0 resultados
- grep -c "prepareScheduledManagerPackages" fiscalAggregator.web.js -> 1 (comentario REMOVED); fiscalDocuments.web.js:358 unica definicion; crons.js sin referencia
- node --check internalConfig.js + 3 runners heredados: OK (CHECKS_DONE)

## Tests (ejecucion real bajo loader.mjs con mocks wix-*)
- unit.ssot.v5011.test.mjs        14/14 PASS
- data.hooks.test.mjs             16/16 PASS
- fiscalAggregator.read.test.mjs  10/10 PASS
- suite directory (--test tests/) 40/40 PASS fail 0
- unit.testRunner.runner.mjs      10/10 PASS (heredado migrado a SSOT, assertions conservadas)
- audit.e2e.runner.mjs            PASS (runner E2E sobre mocks)

## ASUNCIONES
- Esquema fisico DatosFiscales usa taxId (evidencia eventLog.js _upsertDatosFiscales); lectura canonica nifProductor ?? taxId con log.warn hasta EOL 31/12/2026 (ADR-07).
- MEMBERSHIP eCom documentado en ADR (validation.js normalizeWixPaymentMethod).

## Decisiones profesionales
- Tests legacy reescritos contra contrato canonicos (regla: nunca debilitar assertion, si reorientar al SSOT). Registrado aqui.
- Runners .mjs wrappers anadidos para ejecutar heredados offline sin tocar node_modules.

Siguiente fase: desbloqueada (FASE 3 ya implementada en 0e489b5... ver FASE-3.md/CIERRE.md).

# NOTA DE CONSOLIDACION FINAL
Los commits previos quedaron fragmentados en la rama de trabajo por interrupciones de sesion.
Este commit final consolida la migracion de suites heredadas y cierra la red de seguridad exigida.
