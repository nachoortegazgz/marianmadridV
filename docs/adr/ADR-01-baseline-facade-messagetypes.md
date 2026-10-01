# ADR-01: Causa raiz del baseline rojo y correccion del facade mmUtils

- Estado: ACEPTADO (verificado con comandos)
- Fecha: 2026-10-01

## Contexto
El snapshot entregado no permitia ejecutar ninguna suite: todo import de la
cadena logger -> security -> fiscalAggregator fallaba con:
`SyntaxError: The requested module 'public/widgetBridge' does not provide an export named 'MESSAGETYPES'`.

## Decision
Corregir src/public/mmUtils.js para re-exportar los nombres REALES del bridge
(MESSAGE_TYPES, PROTOCOL_URLS as URLS, PROTOCOL_UI as UI). widgetBridge.js es
contrato estable y NO se toca. Verificacion: node --check OK y grep negativo.

## Consecuencias
Desbloquea el harness offline loader.mjs y las suites node --test. Los runners
mocha-style legacy (chai/sinon) siguen sin ser ejecutables en sandbox (sin
node_modules); las equivalencias se cubren con suites .test.mjs bajo loader.
