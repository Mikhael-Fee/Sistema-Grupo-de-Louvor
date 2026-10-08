import { ensurePdfPromiseCompatibility } from './pdf-promise-compat';

// A worker owns a separate Promise constructor. Install the missing API
// before evaluating PDF.js, whose class fields use it during module loading.
ensurePdfPromiseCompatibility();
const { WorkerMessageHandler } = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
export { WorkerMessageHandler };
