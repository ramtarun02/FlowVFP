/**
 * vfpParser.js
 * ============
 * Stream-parses a .vfp JSON file of any size using @streamparser/json.
 *
 * Problem: results files produced by vfp-engine can be hundreds of MB.
 * JSON.parse() on a string that large hits V8's memory limits and throws
 * "Unexpected end of JSON input".
 *
 * Solution: pipe file.stream() through the streaming JSON parser and collect
 * only the three nodes we need — formData, inputFiles, and the fort dump
 * files buried in results.*.*. Everything else (large CP arrays, pressure
 * distributions, etc.) is discarded during parsing without ever being held in
 * memory.
 *
 * Supported file layouts:
 *   Format A (save_vfp_results output):
 *     { formData, inputFiles, results: { wingConfig: { flowKey: { file.fort11: {data,encoding}, ... } } } }
 *
 *   Format B (legacy wrapped):
 *     { main: { formData, inputFiles, results }, manifest }
 *     — handled via $.main.* paths; only practical for small files since the
 *       full `main` value must be assembled in memory.
 */

import { JSONParser } from '@streamparser/json';
import { vfpStorage, isDumpFile } from './vfpStorage';

// ── Stack depth helpers ───────────────────────────────────────────────────────
// @streamparser/json onValue callback:
//   { value, key, parent, stack }
//   stack[i].key = key of ancestor i in its parent
//   stack length = number of containers above the emitted value

const CHUNK_SIZE = 64 * 1024; // 64 KB read chunks

/**
 * Stream-parse `file` extracting formData, inputFiles, and fort dump files.
 *
 * @param {File} file  — The .vfp File object from an <input type="file">
 * @param {Object} [options]
 * @param {(progress: {bytesRead: number, totalBytes: number, percent: number, stage: string}) => void} [options.onProgress]
 *   Optional callback invoked periodically with parsing progress.
 * @returns {Promise<{
 *   formData:    object|null,
 *   inputFiles:  object|null,
 *   flowKeyMeta: { [configKey: string]: { [flowKey: string]: string[] } },
 * }>}
 *
 * Side-effect: stores fort files in IndexedDB (vfpStorage) and clears any
 * previously stored dump data before starting.
 */
export async function streamParseVfpFile(file, { onProgress } = {}) {
  // Clear any previously stored dump data up-front
  await vfpStorage.clear();

  return new Promise((resolve, reject) => {
    let formData   = null;
    let inputFiles = null;

    // flowKeyMeta[configKey][flowKey] = [fileName, ...]
    const flowKeyMeta = {};

    // dumpBuffer[configKey][flowKey][fileName] = {data, encoding}
    // Flushed to IndexedDB in onEnd to avoid mixing sync/async in onValue
    const dumpBuffer  = {};

    // ── Parser setup ─────────────────────────────────────────────────────────
    // Paths:
    //   $.formData              — top-level form fields  (Format A + B after unwrap)
    //   $.inputFiles            — top-level input files  (Format A)
    //   $.results.*.*.*         — individual file entries inside results (Format A)
    //   $.main.formData         — form fields inside a 'main' wrapper   (Format B)
    //   $.main.inputFiles       — input files inside a 'main' wrapper   (Format B)
    //   $.main.results.*.*.*    — file entries inside main.results      (Format B)
    const parser = new JSONParser({
      paths: [
        '$.formData',
        '$.inputFiles',
        '$.results.*.*.*',
        '$.main.formData',
        '$.main.inputFiles',
        '$.main.results.*.*.*',
      ],
      // keepStack: false drops parent value references saving memory; key is
      // still preserved on every StackElement which is all we need.
      keepStack: false,
      stringBufferSize: 64 * 1024,  // buffer large string values
    });

    // ── Value handler ─────────────────────────────────────────────────────────
    parser.onValue = ({ value, key, stack }) => {
      const depth = stack.length; // number of ancestors above this value

      // ── Format A: flat layout ─────────────────────────────────────
      if (depth === 1) {
        if (key === 'formData')   { formData   = value; return; }
        if (key === 'inputFiles') { inputFiles = value; return; }
      }

      // ── Format A: results.*.*.*  (depth=4, stack=[root,results,cfg,flow]) ──
      if (depth === 4 && stack[1]?.key === 'results') {
        handleFileEntry(stack[2]?.key, stack[3]?.key, key, value);
        return;
      }

      // ── Format B: wrapped under 'main' ────────────────────────────
      if (depth === 2 && stack[1]?.key === 'main') {
        if (key === 'formData')   { formData   = value; return; }
        if (key === 'inputFiles') { inputFiles = value; return; }
      }

      // ── Format B: main.results.*.*.*  (depth=5) ───────────────────
      if (depth === 5 && stack[1]?.key === 'main' && stack[2]?.key === 'results') {
        handleFileEntry(stack[3]?.key, stack[4]?.key, key, value);
        return;
      }
    };

    /** Buffer a single fort file entry. */
    function handleFileEntry(configKey, flowKey, fileName, fileObj) {
      if (!configKey || !flowKey || !fileName) return;
      if (!isDumpFile(String(fileName)))        return; // skip large CP/pressure files

      // flowKeyMeta
      if (!flowKeyMeta[configKey])           flowKeyMeta[configKey]          = {};
      if (!flowKeyMeta[configKey][flowKey])  flowKeyMeta[configKey][flowKey] = [];
      if (!flowKeyMeta[configKey][flowKey].includes(fileName)) {
        flowKeyMeta[configKey][flowKey].push(fileName);
      }

      // dumpBuffer
      if (!dumpBuffer[configKey])            dumpBuffer[configKey]           = {};
      if (!dumpBuffer[configKey][flowKey])   dumpBuffer[configKey][flowKey]  = {};
      dumpBuffer[configKey][flowKey][fileName] = fileObj;
    }

    // ── End handler – flush to IndexedDB then resolve ────────────────────────
    parser.onEnd = () => {
      (async () => {
        try {
          if (onProgress) onProgress({ bytesRead: totalBytes, totalBytes, percent: 100, stage: 'indexing' });
          for (const [configKey, flowMap] of Object.entries(dumpBuffer)) {
            await vfpStorage.storeConfigResults(configKey, flowMap);
          }
          if (onProgress) onProgress({ bytesRead: totalBytes, totalBytes, percent: 100, stage: 'complete' });
          resolve({ formData, inputFiles, flowKeyMeta });
        } catch (err) {
          reject(err);
        }
      })();
    };

    parser.onError = (err) => reject(err);

    // ── Feed file.stream() in chunks ─────────────────────────────────────────
    // NOTE: @streamparser/json self-terminates (calls its own end() and fires
    // onEnd) when it reads the root JSON object's closing brace.  The separator
    // option defaults to undefined which triggers that self-termination.
    // We must NOT call parser.end() if the parser already ended itself, or it
    // throws "Tokenizer ended in the middle of a token (state: ENDED)".
    const totalBytes = file.size;
    let bytesRead = 0;
    (async () => {
      const reader = file.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Only call end() for malformed files that never closed their root
            // object.  For well-formed files the parser ends itself first.
            if (!parser.isEnded) parser.end(); // triggers onEnd → resolve
            break;
          }
          // Parser already self-terminated (root '}' was inside the last chunk).
          // Remaining stream data is trailing whitespace — safe to discard.
          if (parser.isEnded) { reader.cancel(); break; }
          parser.write(value);
          bytesRead += value.byteLength;
          if (onProgress) {
            const percent = totalBytes > 0 ? Math.min(99, Math.round((bytesRead / totalBytes) * 100)) : 0;
            onProgress({ bytesRead, totalBytes, percent, stage: 'parsing' });
          }
        }
      } catch (err) {
        reject(err);
      }
    })();
  });
}
