import React, { createContext, useState } from "react";

export const VfpDataContext = createContext();

export const VfpDataProvider = ({ children }) => {
  const [vfpData, setVfpData] = useState({
    metadata: {
      createdAt: new Date().toISOString(),
      version: "1.0",
      module: "FlowVFP CFD",
    },
    results: null,
    formData: {
      simName: "",
      mach: "",
      aoa: "",
      reynolds: "",
      continuationRun: false,
      wingDumpName: "",
      tailDumpName: "",
      uploadId: "",
      continuationSplitKey: "",
      continuationSplitFile: "",
      excrescence: false,
      autoRunner: false,
      autoStepSize: "",
      autoEndAoA: "",
      autoEndMach: "",
      autoMode: "aoa",
      continuationSelections: [],
    },
    inputFiles: {
      wingConfig: {
        fileNames: { GeoFile: "", MapFile: "", DatFile: "" },
        fileData: {},
      },
      tailConfig: {
        fileNames: { GeoFile: "", MapFile: "", DatFile: "" },
        fileData: {},
      },
      bodyFiles: {
        fileNames: [],
        fileData: {},
      },
    },
  });


  return (
    <VfpDataContext.Provider value={{ vfpData, setVfpData }}>
      {children}
    </VfpDataContext.Provider>
  );
};