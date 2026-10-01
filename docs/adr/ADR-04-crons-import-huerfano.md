# ADR-04: crons.js importa bookingServiceSync (modulo 16.2 prohibido, archivo inexistente)

- Estado: ABIERTO - decision humana requerida
crons.js:23 importa processBookingsServiceSyncQueue de backend/bookingServiceSync,
archivo que NO existe en el repo y cuyo modulo esta prohibido (BIBLIA 16.2).
jobs.config es NO TOCAR segun el plan, por lo que no podemos retirar el job
asociado. Opciones: (a) eliminar el import y dejar el cron inerte con log.warn;
(b) autorizar excepcion parcial en jobs.config. No aplicado aun.
