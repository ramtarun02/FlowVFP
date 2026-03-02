/**
 * FlowVFP Domain Types
 * ====================
 * Single source of truth for all data shapes shared between the
 * frontend components and the API layer.
 */

// ── Geometry ─────────────────────────────────────────────────────────────────

/** One spanwise section of an aircraft wing as parsed from a .GEO file. */
export interface GeoSection {
  YSECT:   number;
  G1SECT:  number;   // XLE (leading edge x-position)
  G2SECT:  number;   // XTE (trailing edge x-position)
  HSECT:   number;   // Dihedral / z-position of section root
  IMARK:   number;
  MU:      number;   // Number of upper-surface points
  ML:      number;   // Number of lower-surface points
  XTWSEC:  number;   // Twist reference fraction
  TWIST:   number;   // Section twist (degrees)
  US:      [number, number][];
  LS:      [number, number][];
  US_N:    [number, number][];
  LS_N:    [number, number][];
  NTWIST:  number;
  NHSECT:  number;
  NYSECT:  number;
}

/** 3-D plot data for a single wing section (airfoil outline). */
export interface SectionPlotData {
  xus:   number[];
  zus:   number[];
  xls:   number[];
  zls:   number[];
  xus_n: number[];
  zus_n: number[];
  xls_n: number[];
  zls_n: number[];
  ysect: number;
}

/** Wing geometric properties derived from the GEO file. */
export interface WingSpecs {
  aspectRatio: number;
  wingSpan:    number;
  numSections: number;
  taperRatio:  number;
  wingArea:    number;
}

/** Geometry interpolation methods. */
export type InterpolationMethod =
  | 'linear'
  | 'quadratic'
  | 'elliptical'
  | 'cosine'
  | 'power'
  | 'schuemann'
  | 'hermite'
  | 'exponential';

/** Parameters for the /api/geometry/interpolate-parameter endpoint. */
export interface InterpolateParameterRequest {
  geoData:       GeoSection[];
  plotData?:     SectionPlotData[];
  parameter:     'Twist' | 'Dihedral' | 'XLE';
  startSection:  number;
  endSection:    number;
  method?:       InterpolationMethod;
  aValue?:       number;
  n?:            number;
  kinkEta?:      number;
  kinkValue?:    number | null;
  slopeStart?:   number;
  slopeEnd?:     number;
  decay?:        number;
}

// ── Solver / Simulation ────────────────────────────────────────────────────────

export type AutoMode = 'aoa' | 'mach';

export interface SimulationFormData {
  simName:                 string;
  mach:                    string;
  aoa:                     string;
  reynolds:                string;
  continuationRun:         boolean;
  wingDumpName:            string;
  tailDumpName:            string;
  uploadId:                string;
  continuationSplitKey:    string;
  continuationSplitFile:   string;
  excrescence:             boolean;
  autoRunner:              boolean;
  autoStepSize:            string;
  autoMode:                AutoMode;
  autoEndAoA:              string;
  autoEndMach:             string;
  continuationSelections:  string[];
}

export interface FileConfig {
  fileNames: {
    GeoFile: string;
    MapFile: string;
    DatFile: string;
  };
  fileData: Record<string, string>;
}

export interface BodyFilesConfig {
  fileNames: string[];
  fileData:  Record<string, string>;
}

export interface InputFiles {
  wingConfig: FileConfig;
  tailConfig: FileConfig;
  bodyFiles:  BodyFilesConfig;
}

export interface InitialisationStatus {
  'Solver Status': 'VFP Case created' | 'VFP Case Failed';
  Error:           string | null;
  Warnings:        string | null;
}

export interface VfpData {
  metadata: {
    createdAt: string;
    version:   string;
    module:    string;
  };
  formData:   SimulationFormData;
  inputFiles: InputFiles;
  results:    unknown | null;
  Initialisation?: InitialisationStatus;
}

// ── Post-Processing ────────────────────────────────────────────────────────────

export interface CpSection {
  XPHYS:         number[];
  CP?:           number[];
  MACH?:         number[];
  sectionHeader: string;
  coefficients?: {
    YAVE?: number;
    CL?:   number;
    CD?:   number;
    CM?:   number;
    [key: string]: number | undefined;
  };
}

export interface CpLevel {
  sections: Record<string, CpSection>;
}

export interface CpData {
  levels: Record<string, CpLevel>;
}

export interface ForceCoefficients {
  CL:  number;
  CD:  number;
  CM:  number;
  CDi: number;   // Induced drag
  CDv: number;   // Viscous drag
  CDw: number;   // Wave drag
}

export interface SimulationFile {
  name: string;
  path: string;
  size: number;
  modified: number;
  isDirectory: boolean;
}

export type FileGroups = {
  cp?:     SimulationFile[];
  dat?:    SimulationFile[];
  forces?: SimulationFile[];
  geo?:    SimulationFile[];
  map?:    SimulationFile[];
  vis?:    SimulationFile[];
  txt?:    SimulationFile[];
  log?:    SimulationFile[];
  other?:  SimulationFile[];
};

// ── Upload / VFP archive ──────────────────────────────────────────────────────

export interface UploadVfpResponse {
  session_id:        string;
  manifest:          VfpManifest;
}

export interface VfpManifest {
  splitNodes?: Array<{ key: string; file: string }>;
  [key: string]: unknown;
}

// ── ProWiM ────────────────────────────────────────────────────────────────────

export interface ProWiMRequest {
  A:      number;
  bOverD: number;
  cOverD: number;
  N:      number;
  NSPSW:  number;
  ZPD:    number;
  CTIP:   number;
  NELMNT: number;
  alpha0: number;
  IW:     number;
  CL0:    number[];
  CD0:    number[];
  KS00:   number[];
  ALFAWI: number[];
}

export interface ProWiMResultItem {
  KS0D:    number;
  TS0D:    number;
  theta_s: number;
  ks:      number;
  CZ:      number;
  CZwf:    number;
  CZDwf:   number;
  CZD:     number;
  CX:      number;
  CXwf:    number;
  CXDwf:   number;
  CXD:     number;
}

// ── API error shapes ──────────────────────────────────────────────────────────

export interface ApiError {
  error:   string;
  detail?: string;
}
