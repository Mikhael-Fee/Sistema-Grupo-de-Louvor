// PDF.js publishes types for the main API, but not its worker entry module.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
