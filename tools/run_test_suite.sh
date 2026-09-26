#!/usr/bin/env bash
# ============================================================
# BATERIA DE TESTS ESTATICOS SSOT v5010.1 - Marian Madrid
# TST-01 node --check | TST-02 ASCII strict | TST-03 V1 forbidden imports
# TST-04 zombie modules | TST-05 obsolete collections | TST-06 import resolution
# TST-07 corrupt operators | TST-08 trailing spaces in strings | TST-09 smoke unit tests
# Exit 0 = CONVERGENCIA OPTIMA; exit !=0 = bloqueos pendientes
# ============================================================
cd "$(dirname "$0")/.." || exit 99
PASS=0; FAIL=0; FAILED_IDS=""
report() { # $1 id, $2 desc, $3 status(0/1), $4 detail
  if [ "$3" -eq 0 ]; then echo "  [PASS] $1 $2"; PASS=$((PASS+1));
  else echo "  [FAIL] $1 $2 -> $4"; FAIL=$((FAIL+1)); FAILED_IDS="$FAILED_IDS $1"; fi
}

echo "=== TST-01: node --check (sintaxis JS en todo src/) ==="
ERRS=""; N=0
while IFS= read -r f; do
  N=$((N+1))
  out=$(node --check "$f" 2>&1) || ERRS="$ERRS\n    $f :: $(echo "$out" | head -2 | tr '\n' ' ')"
done < <(find src -name '*.js' -not -path '*/node_modules/*')
if [ -z "$ERRS" ]; then report TST-01 "sintaxis ($N archivos)" 0 ""; else report TST-01 "sintaxis ($N archivos)" 1 -e; echo -e "$ERRS"; fi

echo "=== TST-02: G10 ASCII strict (cero no-ASCII en codigo) ==="
BAD=$(grep -rlP '[^\x00-\x7F]' src --include='*.js' 2>/dev/null | grep -v '\.test\.js$' || true)
if [ -z "$BAD" ]; then report TST-02 "ASCII estricto src/*.js" 0 ""; else report TST-02 "ASCII estricto" 1 "$(echo $BAD)"; fi

echo "=== TST-03: Aislamiento generacional (prohibido wix-bookings/wix-pay/wix-crm-backend legacy) ==="
V1=$(grep -rn "from ['\"]wix-bookings\|from ['\"]wix-pay['\"]\|from ['\"]wix-content-manager\|require(" src --include='*.js' 2>/dev/null | grep -v node_modules | grep -v __tests__ || true)
if [ -z "$V1" ]; then report TST-03 "sin imports V1 obsoletos ni require()" 0 ""; else report TST-03 "V1/require" 1 "hallazgos:"; echo "$V1" | head -10 | sed 's/^/    /'; fi

echo "=== TST-04: Modulos zombie eliminados ==="
ZOMB=""
for m in contabilidad.js m365GraphSync.js bookingServiceSync.js http-functions.js marianAssistant.web.js; do
  found=$(find src backend -name "$m" 2>/dev/null || true)
  [ -n "$found" ] && ZOMB="$ZOMB $found"
done
REFS=$(grep -rn "contabilidad\|m365GraphSync\|bookingServiceSync\|marianAssistant" src --include='*.js' 2>/dev/null | grep -v node_modules | grep -v __tests__ | grep -iv "eliminad\|removed\|zombie" || true)
if [ -z "$ZOMB" ] && [ -z "$REFS" ]; then report TST-04 "cero zombies (archivos+referencias)" 0 ""; else report TST-04 "zombies" 1 "${ZOMB}${REFS:+ +refs}"; echo "$REFS" | head -6 | sed 's/^/    /'; fi

echo "=== TST-05: internalConfig sin colecciones obsoletas ==="
OBS=$(grep -n "ASIENTOS_CONTABLES\|CONFIGURACION_FISCAL\|LIBROIVA\|FacturasRecibidas'\|AsientosContables'" src/backend/internalConfig.js 2>/dev/null || grep -rn "ASIENTOS_CONTABLES\|CONFIGURACION_FISCAL\|LIBROIVA" src --include='internalConfig.js' || true)
if [ -z "$OBS" ]; then report TST-05 "internalConfig limpio" 0 ""; else report TST-05 "internalConfig obsoleto" 1 "lineas:"; echo "$OBS" | head -8 | sed 's/^/    /'; fi

echo "=== TST-06: Resolucion de imports locales (import X from './...' o '../...') ==="
python3 - <<'PY'
import re, os, sys, glob
roots = {}
for base in ('src/backend','src/public','src/pages'):
    for f in glob.glob(base+'/**/*.js', recursive=True):
        roots[os.path.normpath(f)] = True
broken=[]
checked=0
for f in list(roots)+glob.glob('src/**/*.js', recursive=True):
    f=os.path.normpath(f)
    if not os.path.isfile(f): continue
    try: src=open(f,encoding='utf-8').read()
    except Exception: continue
    for m in re.finditer(r"from\s+['\"](\.[^'\"]+)['\"]", src):
        spec=m.group(1); checked+=1
        p=os.path.normpath(os.path.join(os.path.dirname(f),spec))
        cands=[p,p+'.js',os.path.join(p,'index.js')]
        if not any(os.path.isfile(c) for c in cands):
            broken.append(f"{f}: {spec}")
print(f"CHECKED={checked} BROKEN={len(broken)}")
for b in broken[:15]: print("   ",b)
sys.exit(1 if broken else 0)
PY
if [ $? -eq 0 ]; then report TST-06 "imports locales resueltos" 0 ""; else report TST-06 "imports rotos" 1 "ver arriba"; fi

echo "=== TST-07: Operadores corruptos (= > & & ) ==="
COR=$(grep -rnE '[^=!<>]= >[^>=]|& &[^&]' src --include='*.js' 2>/dev/null | grep -v node_modules | grep -v '// ' || true)
if [ -z "$COR" ]; then report TST-07 "cero operadores corruptos" 0 ""; else report TST-07 "operadores" 1 "hallazgos"; echo "$COR" | head -6 | sed 's/^/    /'; fi

echo "=== TST-08: Espacios finales en literales de zona/tipo ==="
TS=$(grep -rnE "'[A-Za-z0-9/_-]+ +'|\"[A-Za-z0-9/_-]+ +\"" src --include='*.js' 2>/dev/null | grep -iE "sv-SE|Europe/Madrid|es-ES|UTC|text/plain|application/" || true)
if [ -z "$TS" ]; then report TST-08 "cero espacios en literales criticos" 0 ""; else report TST-08 "espacios literales" 1 "hallazgos"; echo "$TS" | head -6 | sed 's/^/    /'; fi

echo "=== TST-09: Smoke tests unitarios (node test runner) ==="
if ls src/backend/__tests__/*.test.js >/dev/null 2>&1 || ls tests/*.test.js >/dev/null 2>&1; then
  OUT=$(node --test src/backend/__tests__/ 2>&1); RC=$?
  echo "$OUT" | tail -6 | sed 's/^/    /'
  report TST-09 "node --test" $RC "tests fallidos"
else
  OUT=$(node --test 2>&1); RC=$?
  echo "$OUT" | tail -6 | sed 's/^/    /'
  report TST-09 "node --test (auto-descubrimiento)" $RC "tests fallidos"
fi

echo ""
echo "============================================================"
echo "RESULTADO: PASS=$PASS FAIL=$FAIL ${FAILED_IDS:+-> FALLAN:$FAILED_IDS}"
[ $FAIL -eq 0 ] && echo "ESTADO: CONVERGENCIA OPTIMA SSOT v5010.1 ✅" || echo "ESTADO: BLOQUEOS PENDIENTES ❌"
exit $FAIL
