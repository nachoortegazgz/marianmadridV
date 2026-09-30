MATRIZ DE CAMBIO DE IDS TECNICAS
Marian Madrid - ServiciosCatalogo / Reservas
Fecha: 30/09/2026
Estado: propuesta de migracion controlada

REGLA DE USO
Esta matriz distingue nombres legacy detectados en el material del repositorio de los
identificadores canonicos actuales definidos para el contrato V20. Antes de borrar un
campo CMS, confirmar que el ID actual existe exactamente en la coleccion y que no hay
consumidores fuera del repositorio. No aplicar reemplazos globales sobre documentos,
backups o snapshots.

A. IDS DE SERVICIOS Y RESOLUCION PUBLICA

| Legacy / antiguo                 | Actual / canonico                 | Tipo       | Accion Fase 1 |
|----------------------------------|-----------------------------------|------------|---------------|
| slugUrl                          | slug                              | identidad  | Eliminar alias; leer solo slug |
| phase2ServiceId                  | linkedPhases                      | referencia | Eliminar alias; conservar GUID de Bookings |
| linkFases                        | linkedPhases                      | referencia | Eliminar alias |
| serviceID / servicioID           | serviceId                         | identidad  | Normalizar solo en codigo/payload; verificar CMS |
| id usado como serviceId          | serviceId                         | identidad  | No inferir; no sustituir sin evidencia |

B. IDS DE COMPLEMENTOS

| Legacy / antiguo                 | Actual / canonico                 | Tipo       | Accion Fase 1 |
|----------------------------------|-----------------------------------|------------|---------------|
| addonId                          | addOnId                           | elemento   | Eliminar alias |
| addonIds                         | addOnIds                          | lista      | Eliminar alias |
| addons / addOns                  | addOnOptions                      | coleccion  | Eliminar alias; leer solo addOnOptions |
| nativeAddonId                    | nativeId                          | referencia | Confirmar en SSOT antes de retirar |
| nombre                           | name / title                      | etiqueta   | No mezclar con contrato CMS; definir uno en SSOT |
| precio                           | price                             | importe    | No mezclar con contrato CMS; definir uno en SSOT |
| addonsPrecio                     | addOnOptions[].price              | importe    | Eliminar campo derivado si no es necesario |

C. FECHAS Y DISPONIBILIDAD

| Legacy / antiguo                 | Actual / canonico                 | Tipo       | Accion Fase 1 |
|----------------------------------|-----------------------------------|------------|---------------|
| dateYMD                          | dateYmd                           | fecha      | Eliminar alias |
| ymd en payload publico           | dateYmd                           | fecha      | Usar dateYmd fuera de helpers locales |
| date                             | dateYmd                           | fecha      | No sustituir sin comprobar contexto |
| start/end ambiguos               | localStartDate/localEndDate       | intervalo  | Mantener solo en frontera Bookings |
| imageUrl                         | mainMedia                         | media      | Eliminar alias; verificar tipo CMS |
| mainMediaUrl                     | mainMedia                         | media      | Eliminar alias si aparece |

D. PERSONAL Y VISIBILIDAD

| Legacy / antiguo                 | Actual / canonico                 | Tipo       | Accion Fase 1 |
|----------------------------------|-----------------------------------|------------|---------------|
| staffDisponible                  | availableStaff                    | recursos   | Eliminar fallback legacy |
| hiddenClient                     | clientHidden                      | visibilidad| Eliminar fallback legacy |
| ocultoCliente                    | clientHidden                      | visibilidad| Solo admitir como etiqueta/documentacion, nunca como ID |
| staffOptions                     | availableStaff / staffOptions     | DTO        | No sustituir sin distinguir fuente CMS y DTO |

E. FISCALIDAD Y DURACION

| Legacy / antiguo                 | Actual / canonico                 | Tipo       | Accion Fase 1 |
|----------------------------------|-----------------------------------|------------|---------------|
| taxRate                          | tipoImpositivo                    | fiscal     | Eliminar alias; no convertir silenciosamente |
| taxCode                          | codigoImpuesto                    | fiscal     | Confirmar coincidencia exacta en SSOT |
| buffer                           | [sin equivalente]                 | duracion   | Eliminar del contrato; no mapear |
| totalDuration calculado con 30   | totalDuration / suma de fases    | duracion   | Eliminar fallback 30 |
| linkFases usado para dualidad    | linkedPhases                      | dual       | Eliminar lectura legacy |

F. ERRORES Y NOMBRES INTERNOS

| Legacy / antiguo                 | Actual / canonico                 | Tipo       | Accion Fase 1 |
|----------------------------------|-----------------------------------|------------|---------------|
| ERRORCODES                       | ERROR_CODES                       | constante  | Unificar nombre interno |
| SDKCONFIG                        | SDK_CONFIG                        | constante  | Unificar nombre interno |
| safeTrim                         | _safeTrim                         | helper     | Usar helper importado canonico |
| looksLikeGuid                    | _looksLikeGuid                    | helper     | Usar helper importado canonico |
| structuredError                  | _structuredError                  | helper     | Unificar constructor |
| cacheSetBounded                  | _cacheSetBounded                  | helper     | Unificar helper |
| readImport2Field                 | _readImport2Field                 | helper     | Unificar helper |
| parseImport2Addons               | _parseImport2Addons               | helper     | Unificar helper |

G. IDS QUE NO DEBEN CAMBIARSE

| Identificador actual             | Motivo |
|----------------------------------|--------|
| serviceId                        | Identidad tecnica de servicio |
| slug                             | Identidad publica canonica |
| linkedPhases                     | GUID de Bookings para duales |
| addOnOptions                     | Campo canonico de complementos |
| addOnIds                         | Clave canonica de entrada |
| dateYmd                          | Clave canonica de fecha |
| mainMedia                        | Campo canonico de media |
| clientHidden                     | Campo canonico de visibilidad |
| availableStaff                   | Campo canonico de recursos |
| tipoImpositivo                   | Campo fiscal canonico |
| codigoImpuesto                   | Codigo fiscal canonico |
| itemNature                       | Gate de reservabilidad |
| bookingStatus                    | Estado canonico de CITAS_F2 |

H. PROTOCOLO DE APLICACION

1. Congelar SSOT y confirmar los IDs CMS mediante export o panel de ServiciosCatalogo.
2. Separar codigo ejecutable de snapshots, informes y archivos .txt.
3. Buscar cada legacy por palabra completa, no por substring.
4. Clasificar cada coincidencia: productor, consumidor, test, documentacion o backup.
5. Cambiar productor y consumidores en el mismo commit.
6. Eliminar el alias; no dejar fallback, coalesce ni lectura tolerante.
7. Proyectar DTOs con whitelist y eliminar campos internos.
8. Ejecutar node --check sobre archivos ejecutables.
9. Ejecutar lint, pruebas unitarias, pruebas de contrato y git diff --check.
10. Ejecutar busqueda negativa y guardar el resultado como evidencia.
11. Probar en Wix antes de publicar.
12. Mantener rollback por commit anterior.

I. CRITERIOS DE CIERRE FASE 1

- Cero apariciones de los aliases de las secciones A-E en codigo ejecutable.
- Cero lecturas alternativas mediante ||, ?? o ternarios.
- Cero payloads con nombres antiguos.
- Cero DTOs publicos con campos fiscales, costes o notas internas.
- IDs CMS confirmados en la coleccion actual.
- Sintaxis, lint, pruebas y despliegue de prueba correctos.

Nota: las columnas "actual/canonico" reflejan la convencion V20 indicada en el proyecto.
Los campos marcados "confirmar" requieren comprobacion directa del esquema CMS antes de
una migracion destructiva.
