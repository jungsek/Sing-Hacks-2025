import type { ReactElement } from 'react';

export type PdfFont = { name: string; path: string };

export type PdfOptions = {
  filename?: string;
  format?: string; // e.g. 'A4'
  fonts?: PdfFont[];
};

/**
 * Render a React PDF Document (built with @react-pdf/renderer) to a Buffer.
 *
 * The function uses dynamic imports so the repo doesn't require @react-pdf/renderer
 * unless you actually use PDF generation. If the package is not installed, the
 * function throws a helpful error instructing how to add it.
 *
 * Input: a ReactElement created with @react-pdf/renderer's primitives (Document/Page/...)
 * Output: Promise<Buffer>
 */
export async function generatePdf(
  doc: ReactElement,
  options: PdfOptions = {}
): Promise<Buffer> {
  try {
    // import at runtime to avoid requiring the package when not used
    const pdfModule = await import('@react-pdf/renderer');

    // register fonts if provided
    if (options.fonts && options.fonts.length > 0) {
      const { Font } = pdfModule;
      options.fonts.forEach((f) => {
        try {
          Font.register({ family: f.name, src: f.path });
        } catch (e) {
          // continue; invalid font paths will surface when rendering
        }
      });
    }

    const instance = pdfModule.pdf(doc as any);

    // toBuffer/toStream may return different types depending on environment and versions:
    // - Buffer (Node)
    // - Node Readable stream
    // - Web ReadableStream (has getReader)
    // We'll detect and normalize to a Node Buffer.
    let output: any;

    if (typeof (instance as any).toBuffer === 'function') {
      // Preferred when available
      try {
        output = await (instance as any).toBuffer();
      } catch (innerErr: any) {
        // augment error with some runtime diagnostics to help debugging
        const methods = Object.keys(instance || {}).join(', ');
        const msg = `toBuffer() failed: ${innerErr?.message || String(innerErr)}; instanceKeys=${methods}`;
        const e: any = new Error(msg);
        e.cause = innerErr;
        throw e;
      }
    } else if (typeof (instance as any).toStream === 'function') {
      // Some versions expose toStream
      try {
        output = await (instance as any).toStream();
      } catch (innerErr: any) {
        const methods = Object.keys(instance || {}).join(', ');
        const msg = `toStream() failed: ${innerErr?.message || String(innerErr)}; instanceKeys=${methods}`;
        const e: any = new Error(msg);
        e.cause = innerErr;
        throw e;
      }
    } else {
      // Fallback: instance itself might be a stream-like object
      output = instance as any;
    }

    // If it's already a Buffer, return directly
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(output)) {
      return output as Buffer;
    }

    // If it's a Node Readable stream (has pipe or is async iterable), collect chunks
    if (output && (typeof output.pipe === 'function' || Symbol.asyncIterator in Object(output))) {
      const chunks: Buffer[] = [];
      // support async iterator
      try {
        for await (const chunk of output as AsyncIterable<any>) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      } catch (e) {
        // if async iterator fails, try stream 'data' events
        const stream = output as NodeJS.ReadableStream & { on?: any };
        await new Promise<void>((resolve, reject) => {
          stream.on && stream.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          stream.on && stream.on('end', () => resolve());
          stream.on && stream.on('error', (err: any) => reject(err));
        });
      }
      return Buffer.concat(chunks);
    }

    // If it's a Web ReadableStream (getReader), read chunks and concatenate
    if (output && typeof output.getReader === 'function') {
      const reader = output.getReader();
      const parts: Uint8Array[] = [];
      while (true) {
        // read() returns { value, done }
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          // value may be Uint8Array or ArrayBuffer
          parts.push(value instanceof Uint8Array ? value : new Uint8Array(value));
        }
      }
      const total = parts.reduce((s, p) => s + p.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const p of parts) {
        merged.set(p, offset);
        offset += p.length;
      }
      return Buffer.from(merged.buffer ?? merged);
    }

    // Fallback: try to convert whatever we got into a Buffer
    try {
      return Buffer.from(output as any);
    } catch (e) {
      throw new Error('Unable to convert PDF output to Buffer: ' + String(e));
    }
  } catch (err: any) {
    // If import failed, provide actionable guidance
    if (
      /Cannot find module|ERR_MODULE_NOT_FOUND/.test(String(err.message || err))
    ) {
      throw new Error(
        "@react-pdf/renderer is not installed. Run: 'npm install @react-pdf/renderer' or 'pnpm add @react-pdf/renderer' and retry. If you plan to use Puppeteer instead, implement generatePdf accordingly."
      );
    }

    // Re-throw other errors
    throw err;
  }
}

export default generatePdf;
