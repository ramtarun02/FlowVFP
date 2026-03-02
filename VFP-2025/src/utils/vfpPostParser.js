/**
 * vfpPostParser.js
 * =================
 * Privacy-first streaming parser for .vfp files in Post-Processing.
 *
 * The entire .vfp file is parsed on the client — nothing is uploaded to the
 * server.  Result file data (CP, forces, dat …) is written directly into
 * IndexedDB via vfpPostStorage as each value is emitted, keeping peak memory
 * usage proportional to the largest single file rather than the whole archive.
 *
 * Two passes of the file are **not** required.  A single streaming scan:
 *   1. Captures `formData` (small).
 *   2. Captures Polars at `results.<config>.Polars` (small).
 *   3. Captures every result file at `results.<config>.<flow>.<file>` and
 *      writes it to IndexedDB immediately, recording its name in the manifest.
 *   4. On completion returns the manifest + polars + formData so the
 *      PostProcessing component can render the explorer UI instantly.
 *
 * Memory optimisation
 * ───────────────────
 * `@streamparser/json` materialises one matching value at a time.  After the
 * `onValue` callback copies it into the write-queue the original reference is
 * released.  The read loop awaits pending IndexedDB writes after every 64 KB
 * chunk, keeping the write-queue (and therefore the JS heap delta) bounded.
 *
 * Supported VFP layouts
 * ─────────────────────
 *   Format A  { formData, inputFiles, results: { wingConfig: { flow: { file: {data,enc} } } } }
 *   Format B  { main: { formData, inputFiles, results: { ... } }, manifest: ... }
 */

import { JSONParser } from '@streamparser/json';
import { vfpPostStorage } from './vfpPostStorage';

const CHUNK_SIZE = 64 * 1024; // 64 KB read chunks

/** File name extensions we consider fort dumps (skip for post-processing). */
const DUMP_SUFFIXES = ['.fort11', '.fort15', '.fort21', '.fort50', '.fort51', '.fort52', '.fort55'];
const isDumpFile = (fname) => DUMP_SUFFIXES.some(ext => fname.toLowerCase().endsWith(ext));

/**
 * Stream-parse a `.vfp` File and populate IndexedDB for post-processing.
 *
 * @param {File}     file        – The .vfp File from <input type="file">
 * @param {function} onProgress  – Optional (bytesRead, totalBytes) => void
 * @returns {Promise<{
 *   formData:    object|null,
 *   polars:      object|null,
 *   manifest:    { [configKey]: { [flowKey]: { files: string[], fileTypes: object } } },
 * }>}
 *
 * Side-effect: result file data is written to IndexedDB (vfpPostStorage).
 */
export async function streamParseVfpForPost(file, onProgress) {
  // Wipe any previous import
  await vfpPostStorage.clear();

  const totalBytes = file.size;

  return new Promise((resolve, reject) => {
    let formData = null;

    // Polars reconstruction (individual properties emitted at depth 4)
    const polarsPartials = {}; // { configKey: { propName: value } }

    // Manifest: { configKey: { flowKey: { files: [name, ...], fileTypes: { cp: [...], ... } } } }
    const manifest = {};

    // Write-queue: filled by onValue, drained after each chunk
    const pendingWrites = [];

    // ── Parser setup ─────────────────────────────────────────────────────────
    // We match at depth 4 for both file entries AND Polars properties:
    //   $.results.<configKey>.<flowKeyOrPolars>.<fileOrProp>
    //
    // At depth 1 we also capture formData.
    //
    // Format B (wrapped in `main`) adds 1 extra depth level.
    const parser = new JSONParser({
      paths: [
        '$.formData',
        '$.results.*.*.*',
        '$.results.Polars',           // top-level Polars (alpha-sweep VFP)
        '$.main.formData',
        '$.main.results.*.*.*',
        '$.main.results.Polars',       // top-level Polars (Format B)
      ],
      keepStack: false,
      stringBufferSize: 64 * 1024,
    });

    parser.onValue = ({ value, key, stack }) => {
      const depth = stack.length;

      // ── formData (depth 1 Format A, depth 2 Format B) ─────────────────
      if (depth === 1 && key === 'formData')   { formData = value; return; }
      if (depth === 2 && stack[1]?.key === 'main' && key === 'formData') { formData = value; return; }

      // ── Top-level Polars: results.Polars (alpha-sweep VFP) ────────────
      //    Depth 2: $→results→Polars
      if (depth === 2 && stack[1]?.key === 'results' && key === 'Polars') {
        if (typeof value === 'object' && value !== null) {
          polarsPartials['wingConfig'] = value;
        }
        return;
      }
      if (depth === 3 && stack[1]?.key === 'main' && stack[2]?.key === 'results' && key === 'Polars') {
        if (typeof value === 'object' && value !== null) {
          polarsPartials['wingConfig'] = value;
        }
        return;
      }

      // ── Format A: results.*.*.*  depth = 4 ────────────────────────────
      if (depth === 4 && stack[1]?.key === 'results') {
        handleEntry(stack[2]?.key, stack[3]?.key, key, value);
        return;
      }

      // ── Format B: main.results.*.*.*  depth = 5 ───────────────────────
      if (depth === 5 && stack[1]?.key === 'main' && stack[2]?.key === 'results') {
        handleEntry(stack[3]?.key, stack[4]?.key, key, value);
        return;
      }
    };

    /**
     * Process a single emitted entry.
     *
     * @param {string} configKey   'wingConfig' | 'tailConfig'
     * @param {string} flowOrMeta  A flow key OR 'Polars'
     * @param {string} nameOrProp  File name OR Polars property name
     * @param {*}      val         The value
     */
    function handleEntry(configKey, flowOrMeta, nameOrProp, val) {
      if (!configKey || !flowOrMeta || nameOrProp == null) return;

      // nameOrProp must be a string (file name or polars property).
      // Numeric indices (emitted from array elements inside top-level
      // results.Polars.ALPHA[n] etc.) must be skipped.
      if (typeof nameOrProp !== 'string') return;

      // ── Skip top-level Polars children ──────────────────────────────────
      // When Polars lives at results.Polars (not inside wingConfig),
      // the wildcard match emits results.Polars.<arrName>.<idx>.
      // configKey='Polars' is not a real config — skip entirely.
      if (configKey === 'Polars' || configKey === 'polars') return;

      // ── Polars nested under a config: results.wingConfig.Polars.* ──────
      if (flowOrMeta === 'Polars' || flowOrMeta === 'polars') {
        if (!polarsPartials[configKey]) polarsPartials[configKey] = {};
        polarsPartials[configKey][nameOrProp] = val;
        return;
      }

      // ── Skip non-result meta keys (e.g. flowLLT from downwash) ─────────
      if (flowOrMeta === 'flowLLT') return;

      // ── Skip fort dump files (handled by vfpStorage for RunSolver) ──────
      if (isDumpFile(String(nameOrProp))) return;

      // ── Result file entry ───────────────────────────────────────────────
      const flowKey  = flowOrMeta;
      const fileName = nameOrProp;

      // Update manifest
      if (!manifest[configKey]) manifest[configKey] = {};
      if (!manifest[configKey][flowKey]) manifest[configKey][flowKey] = { files: [], fileTypes: {} };
      const flowEntry = manifest[configKey][flowKey];
      if (!flowEntry.files.includes(fileName)) {
        flowEntry.files.push(fileName);
        const ext = fileName.split('.').pop()?.toLowerCase() || 'other';
        if (!flowEntry.fileTypes[ext]) flowEntry.fileTypes[ext] = [];
        flowEntry.fileTypes[ext].push(fileName);
      }

      // Queue IndexedDB write (drained after each chunk)
      pendingWrites.push(
        vfpPostStorage.storeResultFile(configKey, flowKey, fileName, val)
      );
    }

    // ── End / error handlers ─────────────────────────────────────────────────
    parser.onEnd = () => {
      (async () => {
        try {
          // Flush remaining writes
          if (pendingWrites.length > 0) {
            await Promise.all(pendingWrites);
            pendingWrites.length = 0;
          }

          // Reconstruct polars from partials
          const polars = reconstructPolars(polarsPartials);

          // Store manifest + polars + formData in meta store for quick access
          await vfpPostStorage.storeMeta('manifest', manifest);
          if (polars)   await vfpPostStorage.storeMeta('polars', polars);
          if (formData)  await vfpPostStorage.storeMeta('formData', formData);

          resolve({ formData, polars, manifest });
        } catch (err) {
          reject(err);
        }
      })();
    };

    parser.onError = (err) => reject(err);

    // ── Read file in chunks, drain IDB writes between chunks ─────────────
    (async () => {
      const reader = file.stream().getReader();
      let bytesRead = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (!parser.isEnded) parser.end();
            break;
          }
          if (parser.isEnded) { reader.cancel(); break; }

          parser.write(value);
          bytesRead += value.byteLength;

          // Report progress
          if (onProgress) onProgress(bytesRead, totalBytes);

          // Drain pending IDB writes to keep memory bounded
          if (pendingWrites.length > 0) {
            await Promise.all(pendingWrites);
            pendingWrites.length = 0;
          }
        }
      } catch (err) {
        reject(err);
      }
    })();
  });
}

/**
 * Reconstruct the best Polars object from partial emissions.
 *
 * @param {{ [configKey]: { [prop]: any } }} partials
 * @returns {object|null}
 */
function reconstructPolars(partials) {
  // Prefer wingConfig Polars
  const raw = partials?.wingConfig || partials?.tailConfig || Object.values(partials || {})[0];
  if (!raw) return null;

  const alphaArr = raw.alpha || raw.ALFAWI || raw.alfa || raw.ALPHA;
  const clArr    = raw.CL    || raw.cl    || raw.CL0;
  const cdArr    = raw.CDtotVFP || raw.cd || raw.CD || raw.CD0;

  const valid = Array.isArray(alphaArr) && Array.isArray(clArr) && Array.isArray(cdArr)
    && alphaArr.length > 0 && clArr.length > 0 && cdArr.length > 0;

  if (!valid) return null;
  return { alpha: alphaArr, cl: clArr, cd: cdArr, raw };
}

/**
 * Retrieve a single result file's raw text content from IndexedDB,
 * decoding base64 if necessary, and wrap it as a File/Blob for upload.
 *
 * @param {string} configKey
 * @param {string} flowKey
 * @param {string} fileName
 * @returns {Promise<File|null>}
 */
export async function getResultFileAsBlob(configKey, flowKey, fileName) {
  const fileObj = await vfpPostStorage.getResultFile(configKey, flowKey, fileName);
  if (!fileObj) return null;

  const encoding = fileObj.encoding || 'utf-8';
  let content;
  if (encoding === 'base64') {
    // Decode base64 → binary
    const binStr = atob(fileObj.data);
    const bytes  = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    content = bytes;
  } else {
    content = fileObj.data;
  }
  return new File([content], fileName, { type: 'text/plain' });
}
