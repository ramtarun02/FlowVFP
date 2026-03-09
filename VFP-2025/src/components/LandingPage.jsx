import React from "react";
import { Link, useNavigate } from "react-router-dom";
// Heroicons for Key Capabilities
import { RocketLaunchIcon, PaperAirplaneIcon, CubeTransparentIcon, ChartBarIcon } from "@heroicons/react/24/solid";
// Tabler Icons (for module cards)
import { IconPlaneTilt, IconDelta, IconWaveSine } from "@tabler/icons-react";

const moduleGradients = [
  "bg-gradient-to-br from-[#eaf6ff] via-[#d6eaff] to-[#c3e3ff]", // Geometry Module
  "bg-gradient-to-br from-[#eafcff] via-[#d6f7ff] to-[#c3f0ff]", // VFP Solver
  "bg-gradient-to-br from-[#eafffa] via-[#d6fff7] to-[#c3ffe9]", // VFP Post Module
];

export default function LandingPage() {
  const navigate = useNavigate();

  // Helper for module navigation
  const moduleCards = [
    {
      gradient: moduleGradients[0],
      icon: <IconPlaneTilt size={72} stroke={1.5} className="text-[#1e5bb8]" />,
      title: "Geometry Module",
      desc: "Parametric geometry definition and manipulation for aircraft wing planform, supporting complex wing-body combinations and design iterations.",
      link: "/geometry",
    },
    {
      gradient: moduleGradients[1],
      icon: <IconDelta size={72} stroke={1.5} className="text-[#0ec3e0]" />,
      title: "FlowVFP",
      desc: "Core computational engine implementing viscous full potential equations for accurate transonic flow prediction with boundary layer coupling.",
      link: "/solver",
    },
    {
      gradient: moduleGradients[2],
      icon: <IconWaveSine size={72} stroke={1.5} className="text-[#1ec3a7]" />,
      title: "VFP Post",
      desc: "Comprehensive post-processing and visualization suite for flow field analysis, force integration, and aerodynamic performance assessment.",
      link: "/post",
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "radial-gradient(ellipse 120% 100% at 50% 0%, #f5f9fd 60%, #eaf6ff 100%)",
      }}
    >
      {/* Header */}
      <header
        className="w-[96%] mx-auto mt-6 mb-2 flex items-center justify-between px-10 py-4 rounded-b-2xl shadow-lg"
        style={{
          background: "linear-gradient(90deg, #f7fbff 80%, #eaf6ff 100%)",
          boxShadow: "0 4px 24px 0 rgba(60,120,180,0.07)",
          minHeight: "88px",
          height: "88px",
        }}
      >
        <div className="flex items-center gap-2">
          <img
            src="/VFP-2025/flowVFP-logo.png"
            alt="FlowVFP Logo"
            className="h-14 w-auto max-h-[100px]"
            style={{ minWidth: 56, objectFit: "contain" }}
          />
          <div className="flex flex-col justify-center h-full">
            <div className="text-2xl font-bold text-[#142d4c] leading-tight flex items-center h-full">
              FlowVFP Solver
            </div>
            <div className="text-sm text-[#3a5a7c]">Aircraft Conceptual Design Tool</div>
          </div>
        </div>
        <nav className="flex gap-12 text-base font-medium text-[#142d4c]">
          <a href="https://github.com/ramtarun02/VFP-2025" className="hover:text-[#1e5bb8] transition-colors">Documentation</a>
          <button
            type="button"
            className="hover:text-[#1e5bb8] transition-colors focus:outline-none"
            style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}
            onClick={() => navigate("/research")}
          >
            Research
          </button>
          <a href="#" className="hover:text-[#1e5bb8] transition-colors">Contact</a>
        </nav>
      </header>

      {/* Main Title */}
      <main className="flex flex-col items-center w-full">
        <h1 className="mt-8 text-5xl font-extrabold text-[#142d4c] text-center leading-tight drop-shadow-md">
          Viscous Full Potential Flow Solver
        </h1>
        <p className="mt-4 text-lg text-[#3a5a7c] text-center max-w-3xl">
          Advanced computational framework for rapid flow analysis in aircraft conceptual design, integrating geometry processing, viscous full potential solving, and comprehensive post-processing capabilities.
        </p>

        {/* Interactive Modules Cards */}
        <div className="flex justify-center gap-8 mt-12 w-full">
          {moduleCards.map((mod, idx) => (
            <div
              key={mod.title}
              tabIndex={0}
              role="button"
              aria-label={`Go to ${mod.title}`}
              className={`
                group cursor-pointer transition-all duration-200
                ${mod.gradient}
                rounded-2xl shadow-lg w-[370px] h-[340px] flex flex-col items-center pt-10 pb-8 px-6 border border-[#e0eaf6]
                hover:scale-105 hover:shadow-2xl focus:scale-105 focus:shadow-2xl
                hover:border-[#1e5bb8] focus:border-[#1e5bb8]
                outline-none
              `}
              onClick={() => navigate(mod.link)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") navigate(mod.link);
              }}
            >
              <div className="flex items-center justify-center w-24 h-24 mb-4">
                {mod.icon}
              </div>
              <div className="text-2xl font-bold text-[#142d4c] mb-2">{mod.title}</div>
              <div className="text-base text-[#3a5a7c] text-center mb-6">
                {mod.desc}
              </div>
              <span className="text-[#1e5bb8] font-medium text-base flex items-center gap-2 group-hover:underline group-focus:underline">
                Explore Module <span className="text-xl">&#8594;</span>
              </span>
            </div>
          ))}
        </div>

        {/* Key Capabilities */}
        <section className="w-full flex justify-center mt-16 mb-8">
          {/* Immersive, sleeker container */}
          <div
            className="relative rounded-xl shadow-lg px-10 py-10 w-[1180px] border border-[#e0eaf6] flex flex-col items-center"
            style={{
              background: "linear-gradient(120deg, #f5f9fd 80%, #eaf6ff 100%)",
              boxShadow: "0 8px 32px 0 rgba(60, 120, 180, 0.08)",
              backdropFilter: "blur(2px)",
            }}
          >
            {/* Decorative gradient blur circle */}
            <div
              className="absolute -top-16 left-1/2 -translate-x-1/2 w-[400px] h-[120px] rounded-full pointer-events-none"
              style={{
                background: "radial-gradient(circle, #eaf6ff 0%, #f5f9fd 80%, transparent 100%)",
                filter: "blur(32px)",
                opacity: 0.7,
                zIndex: 0,
              }}
            />
            <h2 className="text-2xl font-bold text-[#142d4c] text-center mb-14 z-10 tracking-tight">
              Key Capabilities
            </h2>
            <div className="flex justify-between w-full z-10 -mt-4">
              {/* Capability Card 1 */}
              <div className="flex flex-col items-center w-1/4 px-2">
                <div className="bg-[#0ec3e0] rounded-xl w-12 h-12 flex items-center justify-center shadow-md mb-4">
                  <RocketLaunchIcon className="w-7 h-7 text-white" />
                </div>
                <div className="text-base font-semibold text-[#142d4c] mb-1 text-center">Rapid Flow Analysis</div>
                <div className="text-sm text-[#3a5a7c] text-center leading-relaxed">
                  Rapid Flow analysis enabling quick optimisation and conceptual studies using Potential Flows
                </div>
              </div>
              {/* Capability Card 2 */}
              <div className="flex flex-col items-center w-1/4 px-2">
                <div className="bg-[#1e5bb8] rounded-xl w-12 h-12 flex items-center justify-center shadow-md mb-4">
                  <PaperAirplaneIcon className="w-7 h-7 text-white" />
                </div>
                <div className="text-base font-semibold text-[#142d4c] mb-1 text-center">Viscous Coupling</div>
                <div className="text-sm text-[#3a5a7c] text-center leading-relaxed">
                  Integrated boundary layer modeling for accurate viscous effects prediction in conceptual design.
                </div>
              </div>
              {/* Capability Card 3 */}
              <div className="flex flex-col items-center w-1/4 px-2">
                <div className="bg-[#232d3f] rounded-xl w-12 h-12 flex items-center justify-center shadow-md mb-4">
                  <CubeTransparentIcon className="w-7 h-7 text-white" />
                </div>
                <div className="text-base font-semibold text-[#142d4c] mb-1 text-center">Parametric Geometry</div>
                <div className="text-sm text-[#3a5a7c] text-center leading-relaxed">
                  Flexible geometry representation enabling rapid configuration exploration and optimization studies.
                </div>
              </div>
              {/* Capability Card 4 */}
              <div className="flex flex-col items-center w-1/4 px-2">
                <div className="bg-[#1ec3a7] rounded-xl w-12 h-12 flex items-center justify-center shadow-md mb-4">
                  <ChartBarIcon className="w-7 h-7 text-white" />
                </div>
                <div className="text-base font-semibold text-[#142d4c] mb-1 text-center">Advanced Visualization</div>
                <div className="text-sm text-[#3a5a7c] text-center leading-relaxed">
                  Comprehensive post-processing tools for flow field visualization and aerodynamic performance metrics.
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#142d4c] mt-auto pt-10 pb-6 px-16">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="bg-white rounded-lg w-14 h-14 flex items-center justify-center shadow">
              <img src="/VFP-2025/flowVFP-logo.png" alt="VFP Flow Solver Icon" className="w-12 h-12 object-contain" />
            </div>
            <div>
              <div className="text-lg font-bold text-white">FlowVFP Solver</div>
              <div className="text-sm text-[#b3c2db]">Version 2.1</div>
            </div>
          </div>
          <nav className="flex gap-12 text-base font-medium text-white">
            <a href="https://github.com/ramtarun02/VFP-2025" className="hover:text-[#0ec3e0] transition-colors">Documentation</a>
            <a href="#" className="hover:text-[#0ec3e0] transition-colors">Publications</a>
            <a href="#" className="hover:text-[#0ec3e0] transition-colors">Support</a>
          </nav>
        </div>
        <hr className="border-[#2e4a6f] mb-6" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-white mb-1">
              Developed by the Applied Aerodynamics Group
            </div>
            <div className="text-sm text-[#b3c2db]">
              Cranfield University, School of Aerospace, Transport and Manufacturing
            </div>
          </div>
          <div className="text-sm text-[#b3c2db] text-right">
            © 2024 Cranfield University<br />
            All rights reserved
          </div>
        </div>
      </footer>
    </div>
  );
}

