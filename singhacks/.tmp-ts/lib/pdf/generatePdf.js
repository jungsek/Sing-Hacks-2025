"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePdf = generatePdf;
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
async function generatePdf(doc, options = {}) {
    try {
        // import at runtime to avoid requiring the package when not used
        const pdfModule = await Promise.resolve().then(() => __importStar(require('@react-pdf/renderer')));
        // register fonts if provided
        if (options.fonts && options.fonts.length > 0) {
            const { Font } = pdfModule;
            options.fonts.forEach((f) => {
                try {
                    Font.register({ family: f.name, src: f.path });
                }
                catch (e) {
                    // continue; invalid font paths will surface when rendering
                }
            });
        }
        const instance = pdfModule.pdf(doc);
        // toBuffer/toStream may return different types depending on environment and versions:
        // - Buffer (Node)
        // - Node Readable stream
        // - Web ReadableStream (has getReader)
        // We'll detect and normalize to a Node Buffer.
        let output;
        if (typeof instance.toBuffer === 'function') {
            // Preferred when available
            output = await instance.toBuffer();
        }
        else if (typeof instance.toStream === 'function') {
            // Some versions expose toStream
            output = await instance.toStream();
        }
        else {
            // Fallback: instance itself might be a stream-like object
            output = instance;
        }
        // If it's already a Buffer, return directly
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(output)) {
            return output;
        }
        // If it's a Node Readable stream (has pipe or is async iterable), collect chunks
        if (output && (typeof output.pipe === 'function' || Symbol.asyncIterator in Object(output))) {
            const chunks = [];
            // support async iterator
            try {
                for await (const chunk of output) {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                }
            }
            catch (e) {
                // if async iterator fails, try stream 'data' events
                const stream = output;
                await new Promise((resolve, reject) => {
                    stream.on && stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
                    stream.on && stream.on('end', () => resolve());
                    stream.on && stream.on('error', (err) => reject(err));
                });
            }
            return Buffer.concat(chunks);
        }
        // If it's a Web ReadableStream (getReader), read chunks and concatenate
        if (output && typeof output.getReader === 'function') {
            const reader = output.getReader();
            const parts = [];
            while (true) {
                // read() returns { value, done }
                // eslint-disable-next-line no-await-in-loop
                const { value, done } = await reader.read();
                if (done)
                    break;
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
            return Buffer.from(output);
        }
        catch (e) {
            throw new Error('Unable to convert PDF output to Buffer: ' + String(e));
        }
    }
    catch (err) {
        // If import failed, provide actionable guidance
        if (/Cannot find module|ERR_MODULE_NOT_FOUND/.test(String(err.message || err))) {
            throw new Error("@react-pdf/renderer is not installed. Run: 'npm install @react-pdf/renderer' or 'pnpm add @react-pdf/renderer' and retry. If you plan to use Puppeteer instead, implement generatePdf accordingly.");
        }
        // Re-throw other errors
        throw err;
    }
}
exports.default = generatePdf;
