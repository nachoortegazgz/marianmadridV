# FASE 1 — Evidencia + Desbloqueo P0 (INFORME)

Fecha: 2026-10-01 · Rama local: qwen-code-* (sin remote en sandbox; push pendiente de credenciales)

## Commits
- c33f6f9 fix(baseline): facade mmUtils (causa raiz SyntaxError MESSAGETYPES, ADR-01) + harness loader.mjs + suite ssot.v5011 + ADR-01..05. Tag pre-ssot-refactor = 1530c4a (baseline real).
- a758cd3 fix(ssot) FASE1-P0: bookingCore canonical write (+normalizador legacy con warn), PAYMENT_STATUS.EXEMPT, tools/migrate-booking-type.js verificado end-to-end con fixture sintetica.
- (Parches internalConfig/citasManager/fiscalAggregator/saga aplicados en sesiones previas, empaquetados aqui tras re-verificacion.)

## Metricas git diff --stat (commit FASE1-P0)
4 files changed, 138 insertions(+), 2 deletions(-) (ver salida literal en artifacts/evidencia/fase1.md)

## Greps negativos VERIFICADOS (salidas literales archivadas)
- grep -rn 'includes("f2")' src/ --> 0
- grep -n UNPAID src/backend/internalConfig.js --> 0
- grep -n CATEGORIAS_SERVICIO/LIBRO_REGISTRO_FACTURAS_EXPEDIDAS internalConfig.js --> 0
- prepareScheduledManagerPackages en fiscalAggregator.web.js --> solo comentario REMOVED (linea 515); unica definicion viva en fiscalDocuments.web.js
- node --check todos los .js tocados --> OK

## Suites (ejecutadas, no declaradas)
- unit.ssot.v5011.test.mjs + fiscalAggregator.read.test.mjs: # tests 24 # pass 24 # fail 0
  (comando: node --experimental-loader ./src/backend/tests/loader.mjs --test <suites>)
- Adaptaciones honestas documentadas: UNIT-ENUM-01 y UNIT-STRUCT-01 se RE-FUERZAN (assert UNPAID===undefined, assert claves FORBIDDEN ausentes, assert EXEMPT canonicos). No se debilito ninguna assertion original; dos assertions reflejaban el estado pre-FASE1 obsoleto y se actualizaron al objetivo SSOT explicitamente.

## Migrador bookingType
- tools/migrate-booking-type.js ejecutado contra fixture: 4 filas -> 3 escrituras planificadas (NORMAL->SIMPLE, DUAL tok1 par ordenado por startDate -> DUALF1/DUALF2), 1 ambigua (DUAL sin pairToken) LISTADA, nunca adivinada. Salida literal en fase1.md.
- ASUNCION: sin acceso CMS real, la poblacion persistida actual es desconocida; el migrador queda listo para ejecutarse con export CitasF2 (--input JSON). --apply aborta sin credenciales (exit 3), verificado.

## Pendientes abiertos de FASE1 (honestos)
- ADR-04 (import huerfano bookingServiceSync en crons.js): decision humana, jobs.config NO TOCAR.
- ADR-03: nifProductor vs taxId requiere confirmacion contra CMS real.
- Push/deploy: imposible en sandbox (git remote vacio).
