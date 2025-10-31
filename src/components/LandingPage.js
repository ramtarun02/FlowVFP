import React from "react";
import { Link } from "react-router-dom";

function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-100 relative">
      {/* Logo Container - Top Left Corner */}
      <div className="absolute top-4 left-8 z-10 flex flex-col items-start">
        <img
          src="/VFP-2025/cranfield-logo.svg"
          alt="/Cranfield University Logo"
          className="w-48 mb-3 transition-transform duration-300 hover:scale-105"
        />
        {/* <button className="bg-gray-200 hover:bg-gray-300 px-4 py-2 border-0 rounded-lg cursor-pointer font-bold text-sm shadow-lg transition-all duration-200 hover:shadow-xl transform hover:-translate-y-0.5">
          Instructions
        </button> */}
      </div>

      {/* Main Layout Container */}
      <div className="min-h-screen flex flex-col">
        {/* Title Section - Top Center */}
        <div className="pt-16 pb-8 flex justify-center">
          <h1 className="text-3xl lg:text-4xl xl:text-5xl font-bold text-blue-700 text-center font-serif leading-tight max-w-4xl">
            Viscous Full Potential Flow Solver
          </h1>
        </div>

        {/* Modules Section - Center/Slightly Below Center */}
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="bg-slate-200 p-8 lg:p-12 rounded-3xl shadow-xl">
            <div className="grid grid-cols-3 gap-8 lg:gap-12 xl:gap-16">
              {/* Geometry Module */}
              <Link
                to="/geometry"
                className="group flex flex-col items-center text-decoration-none transform transition-all duration-300 hover:scale-105 hover:-translate-y-2"
              >
                <div className="bg-white w-64 h-48 lg:w-72 lg:h-52 xl:w-80 xl:h-56 rounded-xl shadow-lg group-hover:shadow-2xl transition-all duration-300 overflow-hidden">
                  <img
                    src="/VFP-2025/Geometry.png"
                    alt="Geometry Module"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <p className="mt-3 text-base lg:text-lg font-bold text-blue-700 group-hover:text-blue-800 transition-colors duration-200 tracking-wide text-center">
                  GEOMETRY MODULE
                </p>
              </Link>

              {/* Run VFP Solver */}
              <Link
                to="/run-solver"
                className="group flex flex-col items-center text-decoration-none transform transition-all duration-300 hover:scale-105 hover:-translate-y-2"
              >
                <div className="bg-white w-64 h-48 lg:w-72 lg:h-52 xl:w-80 xl:h-56 rounded-xl shadow-lg group-hover:shadow-2xl transition-all duration-300 overflow-hidden">
                  <img
                    src="/VFP-2025/solver.PNG"
                    alt="Run VFP Solver"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <p className="mt-3 text-base lg:text-lg font-bold text-blue-700 group-hover:text-blue-800 transition-colors duration-200 tracking-wide text-center">
                  RUN VFP SOLVER
                </p>
              </Link>

              {/* Post Processing Module */}
              <Link
                to="/post-processing"
                className="group flex flex-col items-center text-decoration-none transform transition-all duration-300 hover:scale-105 hover:-translate-y-2"
              >
                <div className="bg-white w-64 h-48 lg:w-72 lg:h-52 xl:w-80 xl:h-56 rounded-xl shadow-lg group-hover:shadow-2xl transition-all duration-300 overflow-hidden">
                  <img
                    src="/VFP-2025/postprocess.png"
                    alt="Post Processing Module"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <p className="mt-3 text-base lg:text-lg font-bold text-blue-700 group-hover:text-blue-800 transition-colors duration-200 tracking-wide text-center">
                  POST PROCESSING MODULE
                </p>
              </Link>
            </div>
          </div>
        </div>

        {/* Footer Section - Bottom */}
        <div className="pb-8 flex justify-center">
          <p className="text-lg lg:text-xl font-bold text-gray-600 text-center max-w-2xl">
            Developed by the Applied Aerodynamics Group
          </p>
        </div>
      </div>

      {/* Subtle background decorative elements */}
      <div className="fixed top-20 right-20 w-24 h-24 bg-blue-100 rounded-full opacity-15 animate-pulse"></div>
      <div className="fixed bottom-20 left-20 w-20 h-20 bg-blue-200 rounded-full opacity-20 animate-bounce"></div>
    </div>
  );
}

export default LandingPage;