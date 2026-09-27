/*
=============================================================================
MODULE: pages/masterPage.js
VERSION: v5010.1-CLEAN
BASE: archivo vacio (0 bytes) detectado en auditoria SSOT v5010.1
RESPONSIBILITY: Master page Velo para todo el site Marian Madrid.
  - Unica mision verificada en FASE7: apertura del lightbox de QR Veri*factu
    cuando una pagina emisora solicita mostrar el recibo digital
    (lightbox QR, contrato paginas v5010.1).
  - No introduce dependencias backend ni publicas: cero imports rotos.
STANDARDS: G10 ASCII Strict, Velo V3 SDK (wix-window-frontend).

FIXES APLICADOS v5010.1-CLEAN:
  - FIX-PUB-08: masterPage vacio -> implementacion minima y fiable del
    unico contrato activo (openQrLightbox via eventos wix-window).
    Se usa la API oficial documentada:
      wixWindow.openLightbox(lightboxId, data)
      wixWindow.onLightboxMessage(handler)   // recepcion desde lightboxes
    Los demas comportamientos globales (header/footer/menu) viven en el
    editor visual; este codigo no duplica lo que el theme ya resuelve
    (regla de oro: mas simple y mas fiable, nunca "creativo").
=============================================================================
*/

import wixWindowFrontend from 'wix-window-frontend';

const LIGHTBOX_QR_ID = 'QR';
const QR_EVENT = 'MM_OPEN_QR_LIGHTBOX';

/**
 * Abre el lightbox de verificacion Veri*factu con los datos del recibo.
 * @param {{qrUrl?: string, receiptHtml?: string, invoiceNumber?: string}} data
 * @returns {Promise<boolean>} true si el lightbox pudo abrirse.
 */
export async function openQrLightbox(data = {}) {
    const payload = {
        qrUrl: typeof data.qrUrl === 'string' ? data.qrUrl.slice(0, 2048) : '',
        receiptHtml: typeof data.receiptHtml === 'string' ? data.receiptHtml.slice(0, 60000) : '',
        invoiceNumber: typeof data.invoiceNumber === 'string' ? data.invoiceNumber.slice(0, 64) : '',
    };

    if (!payload.qrUrl && !payload.receiptHtml) {
        return false;
    }

    try {
        await wixWindowFrontend.openLightbox(LIGHTBOX_QR_ID, payload);
        return true;
    } catch (error) {
        console.error('[masterPage] openQrLightbox failed', {
            code: error?.code || 'LIGHTBOX_OPEN_FAILED',
        });
        return false;
    }
}

$w.onReady(() => {
    // Solicitud de apertura provenida de cualquier pagina del site.
    wixWindowFrontend.addEventListener(QR_EVENT, (eventData) => {
        openQrLightbox(eventData || {});
    });

    // Mensajes emitidos desde el propio lightbox QR (cierre/error).
    wixWindowFrontend.onLightboxMessage((message) => {
        if (message && message.type === 'QR_LIGHTBOX_ERROR') {
            console.warn('[masterPage] QR lightbox reported error', {
                detail: String(message.detail || '').slice(0, 200),
            });
        }
    });
});
