/**
 * vfpStorage.js
 * =============
 * Browser-side IndexedDB storage for VFP dump data.
 *
 * Inspired by the JSON-analyser's privacy-first approach: large VFP files are
 * parsed entirely on the client and only the minimal dump files needed for a
 * continuation run (fort11 / fort15 / fort21 / fort50 / fort51 / fort52 / fort55)
 * are persisted here — the full VFP payload is never uploaded to the server.
 *
 * Lifecycle:
 *   1. User imports a .vfp file → handleImportVFP calls storeConfigResults()
 *      for each config key found in results (wingConfig / tailConfig).
 *   2. VfpDumpSelector lets the user pick one flow key.
 *   3. RunSolver calls getDumpFiles(configKey, flowKey) to retrieve the fort
 *      files and embed them in the simulation payload.
 *   4. On reset or new import, clear() wipes all stored data.
 */

const DB_NAME    = 'FlowVFP_VfpStore';
const DB_VERSION = 1;
const STORE_META = 'meta';
const STORE_FLOW = 'flowKeys'; // keyed by "<configKey>||<flowKey>"

/** File extensions treated as continuation dump files. */
export const DUMP_EXTS = [
  '.fort11', '.fort15', '.fort21',
  '.fort50', '.fort51', '.fort52', '.fort55',
];

/** Returns true when the filename is a dump file. */
export const isDumpFile = (fname) =>
  DUMP_EXTS.some((ext) => fname.toLowerCase().endsWith(ext));

class VfpStorage {
  constructor() {
    this._db    = null;
    this._ready = null;
  }

  /** Lazily open the IndexedDB — safe to call any number of times. */
  init() {
    if (this._ready) return this._ready;

    this._ready = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onerror = () => {
        console.error('[vfpStorage] IndexedDB open failed:', req.error);
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
        if (!db.objectStoreNames.contains(STORE_FLOW)) {
          db.createObjectStore(STORE_FLOW, { keyPath: 'id' });
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

  /** Store an arbitrary metadata value (e.g. importedFileName). */
  async storeMeta(key, value) {
    return this._put(STORE_META, { key, value });
  }

  /** Retrieve a metadata value. */
  async getMeta(key) {
    const row = await this._get(STORE_META, key);
    return row?.value ?? null;
  }

  /**
   * Persist dump files for every flow key under a config key.
   *
   * @param {string} configKey  – 'wingConfig' | 'tailConfig'
   * @param {Object} flowMap    – { [flowKey]: { [fileName]: { data, encoding } } }
   *
   * Only files whose names end in a DUMP_EXT are stored; all others are
   * silently dropped to keep storage footprint minimal.
   */
  async storeConfigResults(configKey, flowMap) {
    await this.init();

    const writes = [];

    for (const [flowKey, files] of Object.entries(flowMap || {})) {
      if (!files || typeof files !== 'object') continue;

      // Keep only fort dump files
      const dumpFiles = Object.fromEntries(
        Object.entries(files).filter(([fname]) => isDumpFile(fname))
      );

      const id = `${configKey}||${flowKey}`;
      writes.push(
        new Promise((resolve, reject) => {
          const tx  = this._db.transaction([STORE_FLOW], 'readwrite');
          const req = tx.objectStore(STORE_FLOW).put({
            id, configKey, flowKey, dumpFiles,
          });
          req.onsuccess = () => resolve();
          req.onerror   = () => reject(req.error);
        })
      );
    }

    await Promise.all(writes);
  }

  /**
   * Retrieve the dump files for a specific config + flow key.
   *
   * @returns {Object} { [fileName]: { data, encoding } } – may be empty
   */
  async getDumpFiles(configKey, flowKey) {
    const id  = `${configKey}||${flowKey}`;
    const row = await this._get(STORE_FLOW, id);
    return row?.dumpFiles ?? {};
  }

  /**
   * Return all stored flow keys grouped by config key.
   *
   * @returns {Object} { [configKey]: string[] }
   */
  async listStoredFlowKeys() {
    const rows = await this._getAll(STORE_FLOW);
    const map  = {};
    for (const row of rows) {
      if (!map[row.configKey]) map[row.configKey] = [];
      map[row.configKey].push(row.flowKey);
    }
    return map;
  }

  /** Wipe all stored VFP data (call on reset or new import). */
  async clear() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction([STORE_META, STORE_FLOW], 'readwrite');
      tx.objectStore(STORE_META).clear();
      tx.objectStore(STORE_FLOW).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }
}

// Singleton — shared across the whole app lifecycle
export const vfpStorage = new VfpStorage();
