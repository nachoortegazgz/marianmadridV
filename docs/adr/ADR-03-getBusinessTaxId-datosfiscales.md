# ADR-03: _getBusinessTaxId sobre DatosFiscales (no ConfiguracionFiscal)

- Estado: ACEPTADO con ASUNCION documentada
ConfiguracionFiscal es FORBIDDEN (BIBLIA 10) y fiscalAggregator.web.js:400 la
consultaba. Se reescribe contra BUSINESS_COLLECTIONS.DATOS_FISCALES con
recordType=CONFIG_SISTEMA y active=true.
ASUNCION (no verificable sin acceso CMS): el plan cita campo nifProductor, pero
el esquema fisico observado en eventLog._upsertDatosFiscales usa taxId. La
implementacion lee canonicamente nifProductor ?? taxId con log.warn transitorio
(EOL 31/12/2026) y fallback "BXXXXXXXX". Requiere confirmacion humana contra el
CMS real antes del deploy.
