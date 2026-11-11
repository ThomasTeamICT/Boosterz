// Tweede pdf-worker, alleen voor browsers die de gewone niet kunnen lezen (Safari en iPadOS vóór 16.4: private
// methodes en static-blokken). Vite bouwt dit bestand om naar het doel van de app (safari14); de gewone worker
// wordt als los bestand gekopieerd en blijft moderne code. Zie src/lib/pdfWorker.ts.
import '../../lib/oudePolyfillsLaden'; // eerst: pdf.js gebruikt at(), hasOwn en structuredClone bij het opstarten
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
