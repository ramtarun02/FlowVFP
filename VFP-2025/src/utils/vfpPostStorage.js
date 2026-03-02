/**
 * vfpPostStorage.js
 * ==================
 * Browser-side IndexedDB storage for VFP post-processing result files.
 *
 * Privacy-first: The full .vfp file is parsed entirely on the client.
 * Result file data (CP, forces, dat, etc.) is stored in IndexedDB so
 * only the file the user explicitly selects gets sent to the server
 * for parsing.
 *
 * Lifecycle:
 *   1. User imports a .vfp → streamParseVfpForPost stores result files here.
 *   2. PostProcessing reads the manifest to populate the explorer UI.
 *   3. When the user clicks a result file, its raw data is read from here
 *      and sent to the server for parsing.
 *   4. On reset or new import, clear() wipes all stored data.
 */

const DB_NAME    = 'FlowVFP_PostStore';
const DB_VERSION = 1;
const STORE_META = 'meta';           // key-value (manifest, polars, formData, etc.)
const STORE_FILES = 'resultFiles';   // keyed by "<configKey>||<flowKey>||<fileName>"

/** Known result-file extensions we want to keep. */
const RESULT_EXTS = new Set([
  'cp', 'dat', 'forces', 'geo', 'map', 'txt', 'log', 'vis', 'conv', 'sum',
]);

/** Extensions that are fort dump files — skip them (handled by vfpStorage). */
const DUMP_SUFFIXES = ['.fort11', '.fort15', '.fort21', '.fort50', '.fort51', '.fort52', '.fort55'];

/** Returns true when the filename is a fort dump file. */
export const isDumpFile = (fname) =>
  DUMP_SUFFIXES.some((ext) => fname.toLowerCase().endsWith(ext));

/** Returns the result file extension (cp, dat, forces, etc.) or null. */
export const getResultExt = (fname) => {
  if (isDumpFile(fname)) return null;
  const ext = fname.rsplit ? fname.split('.').pop()?.toLowerCase() : fname.split('.').pop()?.toLowerCase();
  return RESULT_EXTS.has(ext) ? ext : 'other';
};

class VfpPostStorage {
  constructor() {
    this._db    = null;
    this._ready = null;
  }

  /** Lazily open the IndexedDB. */
  init() {
    if (this._ready) return this._ready;

    this._ready = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onerror = () => {
        console.error('[vfpPostStorage] IndexedDB open failed:', req.error);
        reject(req.error);
      };

      req.onsuccess = () => {
        this._db = req.result;
        resolve();
      };

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          db.createObjectStore(STORE_FILES, { keyPath: 'id' });
        }
      };
    });

    return this._ready;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  async _put(storeName, record) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction([storeName], 'readwrite');
      const req = tx.objectStore(storeName).put(record);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  async _get(storeName, key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction([storeName], 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async _getAll(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction([storeName], 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Store a metadata value (manifest, polars, formData). */
  async storeMeta(key, value) {
    return this._put(STORE_META, { key, value });
  }

  /** Retrieve a metadata value. */
  async getMeta(key) {
    const row = await this._get(STORE_META, key);
    return row?.value ?? null;
  }

  /**
   * Store a single result file's data.
   *
   * @param {string} configKey  – 'wingConfig' | 'tailConfig'
   * @param {string} flowKey    – flow identifier (e.g. "m085re19p8ma_00p25_dat")
   * @param {string} fileName   – file name (e.g. "m085re19p8ma_00p25_dat.cp")
   * @param {object} fileData   – raw file data object { data, encoding }
   */
  async storeResultFile(configKey, flowKey, fileName, fileData) {
    await this.init();
    const id = `${configKey}||${flowKey}||${fileName}`;
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction([STORE_FILES], 'readwrite');
      const req = tx.objectStore(STORE_FILES).put({
        id, configKey, flowKey, fileName, fileData,
      });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * Retrieve raw file data for a specific result file.
   *
   * @returns {{ data: string, encoding: string } | null}
   */
  async getResultFile(configKey, flowKey, fileName) {
    const id  = `${configKey}||${flowKey}||${fileName}`;
    const row = await this._get(STORE_FILES, id);
    return row?.fileData ?? null;
  }

  /**
   * Return all stored result file records for a specific config+flow key.
   *
   * @returns {Array<{ fileName, fileData }>}
   */
  async getFlowFiles(configKey, flowKey) {
    const allRows = await this._getAll(STORE_FILES);
    return allRows
      .filter(r => r.configKey === configKey && r.flowKey === flowKey)
      .map(r => ({ fileName: r.fileName, fileData: r.fileData }));
  }

  /** Wipe all stored post-processing data. */
  async clear() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction([STORE_META, STORE_FILES], 'readwrite');
      tx.objectStore(STORE_META).clear();
      tx.objectStore(STORE_FILES).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }
}

// Singleton
export const vfpPostStorage = new VfpPostStorage();
