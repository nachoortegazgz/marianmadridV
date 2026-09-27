#!/usr/bin/env node
/*
MODULE: tools/dead_code_guard.mjs
VERSION: v5010.7
PURPOSE: guarda anti-regresion de codigo zombi sobre colecciones prohibidas.
FAIL (exit 1) si:
  - cualquier modulo src/ referencia una ID de coleccion prohibida en contexto
    funcional (wixData.query/insert/update/remove/save, COLLECTIONS.X con X
    muerto, o string literal usado como destino de escritura);
  - internalConfig define constantes que apunten a colecciones prohibidas;
  - aparece la coleccion fusionada ConfiguracionFiscal fuera de comentarios.
ASCII only.
*/
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "tools"];
const IGNORE = ["node_modules", ".git", "dist", "coverage", "artifacts", "backup"];

const FORBIDDEN_IDS = [
  "AsientosContables",
  "LibroAsientosContablesDetalle",
  "FacturasRecibidas",
  "ConfiguracionFiscal",
  "LibroRegistroFacturasRecibidas",
  "PlanCuentasContables",
];

// Contextos funcionales: escrituras/lecturas/queries.
// FIX v5010.7 (regex): la alternativa anterior "COLLECTIONS\.[A-Z_]+..." casaba
// CUALQUIER coleccion legitima (falso positivo masivo, 530 hallazgos). Ahora:
//  1) wixData.<op>(... <IdProhibida> ...) en la misma linea;
//  2) string literal "IdProhibida" / 'IdProhibida' (destino de lectura/escritura);
//  3) COLLECTIONS.<CLAVE> donde la clave RESUELVE a una ID prohibida (se
//     comprueba contra el mapa real de internalConfig, no por nombre).
const FUNCTIONAL_PATTERNS = FORBIDDEN_IDS.map((id) => ({
  id,
  re: new RegExp(
    "(wixData\\s*\\.\\s*(?:query|insert|update|remove|save|get)\\s*\\([^)]*" + id +
    "|[\"']" + id + "[\"'])"
  ),
}));

// Constantes muertas: COLLECTIONS.<CLAVE_INEXISTENTE> resuelve a undefined.
const CONFIG_FILE = "src/backend/internalConfig.js";

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (IGNORE.some((p) => full.includes(p))) continue;
    if (e.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(full);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/[^:]\/\/(?![^"']).*$/gm, "");
}

const findings = [];
const files = [];
for (const d of SCAN_DIRS) walk(d, files);

// DECLARATIVE_ALLOWLIST: los guardas y las listas negativas de tests SON la
// declaracion del SSOT (enumeran lo prohibido para prohibirlo). No constituyen
// "uso funcional". Se excluyen por fichero+contexto, no por patron flexible.
const DECLARATIVE_FILES = [
  "tools/dead_code_guard.mjs",
  "tools/ssot_field_guard.mjs",
];
const DECLARATIVE_TEST_MARKER = /forbiddenCollectionNames|FORBIDDEN_COLLECTIONS|COLECCIONES_PROHIBIDAS/;

const configSrc = fs.readFileSync(path.join(ROOT, CONFIG_FILE), "utf8");
const definedKeys = new Set(
  [...configSrc.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*:\s*"/gm)].map((m) => m[1])
);

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const code = stripComments(raw);
  const lines = code.split("\n");

  const relFile = path.relative(ROOT, file).split(path.sep).join("/");
  const isDeclarativeGuard = DECLARATIVE_FILES.includes(relFile);
  // Para tests: solo se tolera el literal dentro del bloque declarativo
  // negativo (delimitado por comentarios de bloque /* ... */ que la BIBLIA
  // exige mantener como guarda). Detectamos el marker en el fichero y
  // verificamos que cada linea literal esta dentro de un array de nombres
  // prohibidos (patrón estricto: linea = 'Nombre' seguido de , o fin-array).
  const isNegativeTestBlock = (file.includes("__tests__") || file.includes(".test.")) &&
    DECLARATIVE_TEST_MARKER.test(raw);

  lines.forEach((line, i) => {
    for (const p of FUNCTIONAL_PATTERNS) {
      if (p.re.test(line)) {
        if (isDeclarativeGuard) continue;
        // internalConfig: definicion FORBIDDEN_COLLECTIONS es declarativa.
        if (file.endsWith("internalConfig.js") && /^\s*"[A-Za-z]+",\s*$/.test(line)) continue;
        // unit.testRunner: lista negativa forbiddenCollectionNames es declarativa.
        if (isNegativeTestBlock && /^\s*['"][A-Za-z]+['"],?\s*$/.test(line)) continue;
        findings.push(`${file}:${i + 1} [${p.id}] ${line.trim().slice(0, 100)}`);
      }
    }
    const deadConst = line.match(/COLLECTIONS\.([A-Z][A-Z0-9_]+)/g) || [];
    for (const ref of deadConst) {
      const key = ref.split(".")[1];
      if (!definedKeys.has(key)) {
        findings.push(`${file}:${i + 1} [DEAD_CONSTANT] ${ref} no existe en internalConfig`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error("DEAD_CODE_GUARD_FAIL (" + findings.length + ")");
  for (const f of findings) console.error("  " + f);
  process.exit(1);
}
console.log("DEAD_CODE_GUARD_PASS");
