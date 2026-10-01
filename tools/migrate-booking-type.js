#!/usr/bin/env node
/*
=============================================================================
migrate-booking-type.js (DECHABLE, no es modulo backend - FASE1-P0 1.4)
Purpose: migrate persisted CitasF2 rows from legacy bookingType values
(NORMAL/DUAL/DUAL_F1/DUAL_F2/linked/multi_phase) to canonical BIBLIA 11.2
(SIMPLE/DUALF1/DUALF2). Ambiguous DUAL rows without pairToken are listed for
manual inspection instead of being guessed.
Usage (requires Wix CMS access or --dry-run against a JSON export):
  node tools/migrate-booking-type.js --input citasf2-export.json [--apply]
Resolution rule (plan 1.4): pairToken + startDate groups DUAL into F1/F2;
rows that cannot be resolved unambiguously are REPORTED, never written.
G10 ASCII strict. No secrets. No console.log in backend (this is a tool).
=============================================================================
*/
"use strict";

const CANONICAL = { SIMPLE: "SIMPLE", DUALF1: "DUALF1", DUALF2: "DUALF2" };
const LEGACY_SINGLE = new Set(["NORMAL", "SIMPLE", "PAQUETE", "SUSCRIPCION", "REENVIAR", "CANCELLED", "COMPLETED", "NO_SHOW", "PACKAGE", "SUBSCRIPTION", "RESCHEDULE"]);

function resolveRow(row, dualGroups) {
  const raw = String(row.bookingType || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw === "DUALF1") return { write: row.bookingType === CANONICAL.DUALF1 ? null : CANONICAL.DUALF1 };
  if (raw === "DUALF2") return { write: row.bookingType === CANONICAL.DUALF2 ? null : CANONICAL.DUALF2 };
  if (raw === "SIMPLE") return { write: row.bookingType === CANONICAL.SIMPLE ? null : CANONICAL.SIMPLE };
  if (LEGACY_SINGLE.has(raw)) return { write: CANONICAL.SIMPLE };
  if (raw === "DUAL" || raw === "LINKED" || raw === "MULTIPHASE") {
    const key = `${row.pairToken || ""}|${String(row.startDate || "").slice(0, 10)}`;
    if (!row.pairToken) return { ambiguous: true, reason: "legacy DUAL without pairToken" };
    const group = dualGroups.get(key);
    if (!group || group.length < 1) return { ambiguous: true, reason: "pairToken group not found in export" };
    // Phase resolution by time order within the pair group.
    const sorted = [...group].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const idx = sorted.findIndex((r) => r._id === row._id);
    if (idx < 0) return { ambiguous: true, reason: "row not in its own group" };
    const target = idx === 0 ? CANONICAL.DUALF1 : CANONICAL.DUALF2;
    return { write: row.bookingType === target ? null : target };
  }
  return { ambiguous: true, reason: `unknown legacy value "${row.bookingType}"` };
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = (() => { const i = args.indexOf("--input"); return i >= 0 ? args[i + 1] : null; })();
  const apply = args.includes("--apply");
  if (!inputPath) {
    console.error("usage: node tools/migrate-booking-type.js --input <citasf2.json> [--apply]");
    process.exit(2);
  }
  const fs = require("node:fs");
  const rows = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const dualGroups = new Map();
  for (const r of rows) {
    const raw = String(r.bookingType || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (raw === "DUAL" || raw === "LINKED" || raw === "MULTIPHASE" || raw === "DUALF1" || raw === "DUALF2") {
      const key = `${r.pairToken || ""}|${String(r.startDate || "").slice(0, 10)}`;
      if (!dualGroups.has(key)) dualGroups.set(key, []);
      dualGroups.get(key).push(r);
    }
  }
  const writes = [];
  const ambiguous = [];
  for (const r of rows) {
    const res = resolveRow(r, dualGroups);
    if (res.ambiguous) ambiguous.push({ _id: r._id, bookingType: r.bookingType, reason: res.reason });
    else if (res.write) writes.push({ _id: r._id, from: r.bookingType, to: res.write });
  }
  console.log(JSON.stringify({ total: rows.length, migrations: writes.length, ambiguous: ambiguous.length }, null, 2));
  if (ambiguous.length) console.log("AMBIGUOUS (manual inspection required):\n" + JSON.stringify(ambiguous, null, 2));
  if (writes.length) console.log("PLANNED WRITES:\n" + JSON.stringify(writes, null, 2));
  if (apply && writes.length) {
    console.error("--apply requires CMS credentials via Secrets Manager; this sandbox has none. Aborting write phase.");
    process.exit(3);
  }
}

main();
