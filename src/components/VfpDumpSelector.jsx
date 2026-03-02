/**
 * VfpDumpSelector.jsx
 * ===================
 * Privacy-first tree picker for selecting a continuation dump from a locally
 * parsed VFP file.  Inspired by the JSON-analyser prototype.
 *
 * Tree structure:
 *   configKey (Wing / Tail)
 *     └─ flowKey  [radio button]  ──  fort11 / fort15 / … badges
 *
 * Props
 * -----
 * flowKeyMeta  : { [configKey]: { [flowKey]: string[] } }
 *                Keys and file names extracted from vfp.results — no file data.
 * selectedDump : { configKey, flowKey } | null
 * onSelectDump : (selection: { configKey, flowKey } | null) => void
 *                Parent fetches the actual dump bytes from vfpStorage.
 */

import React, { useState } from 'react';
import { DUMP_EXTS } from '../utils/vfpStorage';

const CONFIG_DISPLAY = {
  wingConfig: { label: 'Wing', colour: 'emerald' },
  tailConfig: { label: 'Tail', colour: 'violet'  },
};

const colourMap = {
  emerald: {
    header:  'bg-emerald-50 border-emerald-200 text-emerald-800',
    accent:  'border-emerald-300',
    badge:   'bg-emerald-100 text-emerald-700',
    radio:   'accent-emerald-600',
    selected:'border-emerald-400 bg-emerald-50',
  },
  violet: {
    header:  'bg-violet-50 border-violet-200 text-violet-800',
    accent:  'border-violet-300',
    badge:   'bg-violet-100 text-violet-700',
    radio:   'accent-violet-600',
    selected:'border-violet-400 bg-violet-50',
  },
};

export default function VfpDumpSelector({ flowKeyMeta, selectedDump, onSelectDump }) {
  const [expandedConfigs, setExpandedConfigs] = useState(() => {
    const init = {};
    Object.keys(flowKeyMeta || {}).forEach((k) => { init[k] = true; });
    return init;
  });
  const [expandedFlows, setExpandedFlows] = useState({});
  const [search, setSearch] = useState('');

  const configs = Object.entries(flowKeyMeta || {});

  const toggleConfig = (ck) =>
    setExpandedConfigs((p) => ({ ...p, [ck]: !p[ck] }));

  const toggleFlow = (id) =>
    setExpandedFlows((p) => ({ ...p, [id]: !p[id] }));

  if (configs.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-center">
        <p className="text-xs text-gray-500 italic">
          No continuation dump data found in the imported VFP file.
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          Enter Wing / Tail dump names manually in the sections above.
        </p>
      </div>
    );
  }

  const lowerSearch = search.toLowerCase();

  return (
    <div className="rounded-xl border border-blue-200 overflow-hidden shadow-sm">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-200">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 7h16M4 12h12M4 17h8" />
          </svg>
          <span className="text-sm font-semibold text-blue-800">Select Continuation Dump</span>
        </div>
        {selectedDump && (
          <button
            type="button"
            onClick={() => onSelectDump(null)}
            className="text-[11px] text-red-500 hover:text-red-700 font-medium transition-colors"
          >
            Clear selection
          </button>
        )}
      </div>

      {/* ── Search ── */}
      <div className="px-3 py-2 bg-white border-b border-blue-100">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter flow keys…"
          className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      {/* ── Config sections ── */}
      <div className="divide-y divide-blue-100 bg-white">
        {configs.map(([configKey, flowKeyFiles]) => {
          const meta     = CONFIG_DISPLAY[configKey] ?? { label: configKey, colour: 'emerald' };
          const colours  = colourMap[meta.colour] ?? colourMap.emerald;
          const expanded = expandedConfigs[configKey] ?? true;

          // Apply search filter
          const visibleKeys = Object.entries(flowKeyFiles).filter(
            ([fk]) => !lowerSearch || fk.toLowerCase().includes(lowerSearch)
          );

          return (
            <div key={configKey}>
              {/* Config header row */}
              <button
                type="button"
                onClick={() => toggleConfig(configKey)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left border-b ${colours.header} hover:opacity-90 transition-opacity`}
              >
                <span className="text-[10px] w-3 leading-none select-none">
                  {expanded ? '▼' : '▶'}
                </span>
                <span className="text-sm font-semibold">{meta.label} Configuration</span>
                <span className="ml-auto text-[11px] opacity-70 font-normal">
                  {Object.keys(flowKeyFiles).length} flow{Object.keys(flowKeyFiles).length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Flow key list */}
              {expanded && (
                <div className="pl-2 py-1 space-y-1">
                  {visibleKeys.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400 italic">
                      No matching flow keys.
                    </p>
                  )}
                  {visibleKeys.map(([flowKey, fileNames]) => {
                    const id         = `${configKey}||${flowKey}`;
                    const isSelected = (
                      selectedDump?.configKey === configKey &&
                      selectedDump?.flowKey   === flowKey
                    );
                    const isExpanded = expandedFlows[id] ?? false;
                    const dumpCount  = fileNames.filter((fn) =>
                      DUMP_EXTS.some((ext) => fn.toLowerCase().endsWith(ext))
                    ).length;
                    const hasDumps = dumpCount > 0;

                    return (
                      <div
                        key={flowKey}
                        className={`mx-2 rounded-lg border transition-all ${
                          isSelected ? colours.selected : 'border-transparent hover:border-gray-200'
                        }`}
                      >
                        {/* Flow key row */}
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          {/* Expand / collapse file list */}
                          <button
                            type="button"
                            onClick={() => toggleFlow(id)}
                            className="text-[10px] text-gray-400 hover:text-gray-600 w-3 flex-shrink-0 leading-none"
                            title="Show / hide files"
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>

                          {/* Selection radio */}
                          <input
                            type="radio"
                            name="continuationDump"
                            className={`flex-shrink-0 ${colours.radio} cursor-pointer`}
                            checked={isSelected}
                            disabled={!hasDumps}
                            onChange={() => onSelectDump({ configKey, flowKey })}
                            title={hasDumps ? `Use ${flowKey} as continuation dump` : 'No dump files available for this flow key'}
                          />

                          {/* Flow key label */}
                          <span
                            className={`flex-1 text-xs font-mono truncate ${
                              hasDumps ? 'text-gray-800' : 'text-gray-400'
                            }`}
                            title={flowKey}
                          >
                            {flowKey}
                          </span>

                          {/* Badges */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {hasDumps ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colours.badge}`}>
                                {dumpCount} dump{dumpCount !== 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-[10px] text-orange-400" title="No fort dump files for this flow key">
                                no dumps
                              </span>
                            )}
                            {isSelected && (
                              <span className="flex items-center gap-0.5 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-semibold">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                  <path d="M5 13l4 4L19 7" />
                                </svg>
                                Selected
                              </span>
                            )}
                          </div>
                        </div>

                        {/* File listing (expanded) */}
                        {isExpanded && (
                          <div className="pl-8 pb-2 space-y-0.5">
                            {fileNames.map((fn) => {
                              const isDump = DUMP_EXTS.some((ext) => fn.toLowerCase().endsWith(ext));
                              return (
                                <div
                                  key={fn}
                                  className={`text-[10px] font-mono flex items-center gap-1 ${
                                    isDump ? 'text-blue-700 font-semibold' : 'text-gray-400'
                                  }`}
                                >
                                  <span className="w-3 text-center select-none">
                                    {isDump ? '⚙' : '·'}
                                  </span>
                                  <span className="truncate">{fn}</span>
                                  {isDump && (
                                    <span className="flex-shrink-0 text-[9px] bg-blue-100 text-blue-600 px-1 rounded">
                                      dump
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Selected summary ── */}
      {selectedDump && (
        <div className="px-3 py-2 bg-blue-100 border-t border-blue-200">
          <p className="text-xs text-blue-800">
            <span className="font-semibold">Continuation from:</span>{' '}
            <span className="font-mono font-bold">{selectedDump.flowKey}</span>
            {' '}
            <span className="opacity-70">
              ({CONFIG_DISPLAY[selectedDump.configKey]?.label ?? selectedDump.configKey})
            </span>
          </p>
          <p className="text-[11px] text-blue-600 mt-0.5">
            Only the selected dump files will be sent to the server — the rest of the
            VFP file stays on your computer.
          </p>
        </div>
      )}
    </div>
  );
}
