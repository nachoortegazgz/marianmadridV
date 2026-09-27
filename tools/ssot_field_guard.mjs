#!/usr/bin/env node
/*
MODULE: tools/ssot_field_guard.mjs
VERSION: v5010.6-GUARD-1
PURPOSE: Detectar alias/legacy y colecciones prohibidas en src/ y tools/.
CRITERIA (prompt maestro BLOQUE 4.1):
  - FAIL si hay colecciones prohibidas activas.
  - FAIL si hay field keys legacy en lecturas/escrituras CMS.
  - FAIL si hay hiddenCliente o linkedPhasess.
  - WARNING si el termino aparece solo en comentarios/documentacion interna.
  - PASS si no hay uso funcional de alias/legacy.
STANDARDS: ASCII only. No Node builtins beyond fs/path (tooling, not Velo).
*/

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// v5010.7 TEST-FIXTURES: los archivos de test construyen MOCKS del payload
// OFICIAL Wix (checkout.lineItems, refund.amount, etc.). Eso no es
// persistencia interna SSOT; es el contrato externo simulado que el propio
// guard debe permitir (BLOQUE 3 excepcion oficial). En tests solo se
// penalizan colecciones prohibidas y alias tipograficos (incondicionales);
// LEGACY_FIELD_KEYS/OFFICIAL_WIX_KEYS se degradan a WARNING para revision.
const TEST_FILE_RE = /(\.test\.js|__tests__[\\/])/;

// Colecciones prohibidas/eliminadas (BIBLIA R3/R4/R7).
const FORBIDDEN_COLLECTIONS = [
  "AsientosContables",
  "LibroAsientosContablesDetalle",
  "FacturasRecibidas",
  "ConfiguracionFiscal",
];

// Alias tipograficos/campos muertos prohibidos incluso en comentarios.
const ALWAYS_FORBIDDEN = [
  "hiddenCliente",
  "linkedPhasess",
];

// Field keys legacy internos: FAIL solo si se usan como clave de objeto
// (lectura item.<campo>, escritura { <campo>: ... }), nunca dentro de
// claves canonicas compuestas (totalAmount, depositAmount, grossSalesTotal...).
// v5010.7 REFINAMIENTO (clasificacion documentada de los 77 hallazgos):
//   - "invoiceNumber"/"recipientTaxId"/"invoiceIssueDate"/"recipientLegalName":
//     NO son alias. Son los nombres V20.1 CANONICOS del ledger MovimientosCaja
//     (BIBLIA Grupo 1 + internalConfig matriz). El alias prohibido era
//     "numSerieFactura" como field key CMS (debe vivir solo DENTRO del
//     snapshot fiscalPayload AEAT). Se retiran del detector para no marcar
//     como deuda el contrato vigente; la coherencia campo<->ledger la
//     vigila dead_code_guard y las suites E2E.
//   - "lineItems"/"productId": campos OFICIALES Wix eCom/Stores. Solo son
//     legacy si se PERSISTEN en colecciones propias. Se detectan exclusivamente
//     en contexto de escritura CMS (wixData.insert/save/update) via
//     WRITE_CONTEXT_PATTERNS; su lectura de payload oficial es boundary legal.
//   - "amount"/"concept": persistencia propia usa totalAmount/
//     operationDescription; el nombre interno descriptivo puede seguir siendo
//     variable local o parametro de funcion (no field key). Se exige contexto
//     de objeto literal ({ amount: } / obj.amount) ademas de clave de objeto.
const LEGACY_FIELD_KEYS = [
  "amount",
  "concept",
  "hash",
  "prevHash",
  "registeredAt",
  "taxTreatment",
  "issueDate",
  "taxBreakdown",
  "businessTaxId",
  "enlazadaFases",
];

// Campos oficiales Wix: FAIL solo si aparecen como field key DENTRO de una
// llamada de escritura CMS (persistencia interna con modelo oficial).
const OFFICIAL_WIX_KEYS_IN_WRITES = ["lineItems", "productId"];
const WRITE_CALL_RE = /wixData\s*\.\s*(insert|update|save)\s*\(/;

const SCAN_FOLDERS = ["src", "tools"];
const IGNORE_SEGMENTS = ["node_modules", ".git", "dist", "coverage", "backup"];
const FILE_EXT = /\.(js|mjs|cjs)$/;

// v5010.7 SENTINEL: las lineas que contienen este marcador declaran
// explicitamente un acceso a payload OFICIAL Wix (boundary legal, BLOQUE 3
// excepcion). El guard lo respeta SOLO para campos de la lista oficial Wix
// (amount/lineItems/productId); los alias tipograficos y colecciones
// prohibidas siguen siendo FAIL incondicional.
const BOUNDARY_SENTINEL = "WIX-BOUNDARY";

// Self-exclusion: los guardas enumeran los terminos prohibidos PARA prohibirlos.
// Su lista de deteccion no es uso funcional (mismo criterio que dead_code_guard
// DECLARATIVE_ALLOWLIST). Sin esto el guard se auto-denunciaba (4 FAIL propios).
const SELF_EXCLUDED_FILES = [
  "tools/ssot_field_guard.mjs",
  "tools/dead_code_guard.mjs",
];

const findings = [];   // FAIL
const warnings = [];   // revisables

function isIgnored(p) {
  return IGNORE_SEGMENTS.some((seg) => p.split(path.sep).includes(seg));
}

function stripCommentsAndStrings(line) {
  // Remove line comments and string literals to isolate CODE usage.
  let out = line.replace(/\/\/.*$/, "");
  out = out.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, "``");
  return out;
}

function keyUsageRegex(field) {
  // Matches: obj.field  |  { field:  |  "field":  |  ['field']  but NOT xField or fieldName suffixes.
  const esc = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dotAccess = new RegExp("(?:^|[^A-Za-z0-9_$.])[A-Za-z0-9_$]+\\." + esc + "(?:$|[^A-Za-z0-9_])");
  const objectKey = new RegExp("[{,(]\\s*" + esc + "\\s*:");
  const quotedKey = new RegExp("['\"]" + esc + "['\"]\\s*:");
  const bracketKey = new RegExp("\\[\\s*['\"]" + esc + "['\"]\\s*\\]");
  return { dotAccess, objectKey, quotedKey, bracketKey };
}

function checkLine(file, lineNo, rawLine, ctx) {
  // Self-exclusion: los guardas contienen la lista prohibida como declaracion
  // de deteccion, no como uso funcional (criterio identico al de
  // dead_code_guard DECLARATIVE_ALLOWLIST).
  if (SELF_EXCLUDED_FILES.some((f) => file.endsWith(f))) return;

  const code = stripCommentsAndStrings(rawLine);
  const isCommentOnly = /^\s*(\*|\/\/)/.test(rawLine) || code.trim() === "";

  for (const col of FORBIDDEN_COLLECTIONS) {
    if (code.includes(col)) {
      findings.push({ file, lineNo, term: col, kind: "FORBIDDEN_COLLECTION" });
    } else if (rawLine.includes(col)) {
      warnings.push({ file, lineNo, term: col, kind: "COMMENT_REFERENCE" });
    }
  }

  for (const term of ALWAYS_FORBIDDEN) {
    if (code.includes(term) || (!isCommentOnly && rawLine.includes(term))) {
      findings.push({ file, lineNo, term, kind: "TYPO_ALIAS" });
    }
  }

  for (const field of LEGACY_FIELD_KEYS) {
    const rx = keyUsageRegex(field);
    if (rx.dotAccess.test(code) || rx.objectKey.test(code) || rx.quotedKey.test(code) || rx.bracketKey.test(code)) {
      // Excepcion documentada BLOQUE 3: lectura de payload OFICIAL Wix.
      // "amount" es contrato oficial eCom Money/Price; una linea marcada con
      // el sentinel WIX-BOUNDARY declara acceso fronterizo, no persistencia
      // interna. El resto de campos legacy no admiten sentinel.
      if (field === "amount" && rawLine.includes(BOUNDARY_SENTINEL)) break;
      // En archivos de test, amount/concept como clave de objeto son fixtures
      // del contrato externo simulado (mock) -> WARNING, no FAIL.
      if (TEST_FILE_RE.test(file) && (field === "amount" || field === "concept")) {
        warnings.push({ file, lineNo, term: field, kind: "TEST_FIXTURE_FIELD" });
        break;
      }
      findings.push({ file, lineNo, term: field, kind: "LEGACY_FIELD_KEY" });
    }
  }

  // Campos oficiales Wix (lineItems/productId): FAIL SOLO si se persisten
  // dentro de una escritura CMS (mezcla de modelos oficial-interno, BLOQUE 5).
  // La lectura del payload oficial es boundary legal y no se marca.
  if (ctx && ctx.writeDepth > 0) {
    for (const field of OFFICIAL_WIX_KEYS_IN_WRITES) {
      const rx = keyUsageRegex(field);
      if (rx.objectKey.test(code) || rx.quotedKey.test(code) || rx.bracketKey.test(code)) {
        // En tests, los mocks de escritura simulan payloads oficiales -> WARNING.
        if (TEST_FILE_RE.test(file)) {
          warnings.push({ file, lineNo, term: field, kind: "TEST_FIXTURE_OFFICIAL_FIELD" });
          break;
        }
        findings.push({ file, lineNo, term: field, kind: "OFFICIAL_WIX_PERSISTED_INNERLY" });
      }
    }
  }
}

// Balanceo de parentesis para saber si una linea vive dentro de una llamada
// wixData.insert/update/save( aun no cerrada.
function balanceParens(line, depth) {
  let d = depth;
  let inStr = false;
  let q = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === q && line[i - 1] !== "\\") inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = true; q = c; continue; }
    if (c === "/" && line[i + 1] === "/") break;
    if (c === "(") d++;
    else if (c === ")") d--;
  }
  return Math.max(d, 0);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (isIgnored(full)) continue;
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && FILE_EXT.test(entry.name)) {
      const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
      const ctx = { writeDepth: 0 };
      lines.forEach((line, i) => {
        const opening = WRITE_CALL_RE.test(line);
        checkLine(full, i + 1, line, ctx);
        const nextDepth = balanceParens(line, ctx.writeDepth);
        ctx.writeDepth = opening ? Math.max(nextDepth, 1) : nextDepth;
      });
    }
  }
}

for (const folder of SCAN_FOLDERS) walk(path.join(ROOT, folder));

if (warnings.length > 0) {
  console.log("SSOT_GUARD_WARNINGS (" + warnings.length + "):");
  for (const w of warnings) console.log("  WARN " + w.file + ":" + w.lineNo + " " + w.kind + " -> " + w.term);
}

if (findings.length > 0) {
  console.error("SSOT_GUARD_FAIL (" + findings.length + "):");
  for (const f of findings) console.error("  FAIL " + f.file + ":" + f.lineNo + " " + f.kind + " -> " + f.term);
  process.exit(1);
}

console.log("SSOT_GUARD_PASS");
