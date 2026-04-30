import React from "react";
import { useNavigate } from "react-router-dom";

// Categorized references from your .bib file
const references = {
    "FP and VFP Methods": [
        {
            authors: "Jameson, A., & Caughey, D. A.",
            year: 1977,
            title: "Solution of the Euler equations for two dimensional transonic flow by a finite volume method",
            journal: "Lecture Notes in Physics",
            volume: "59",
            pages: "175–201",
            url: "https://link.springer.com/chapter/10.1007/3-540-08546-2_9",
        },
        {
            authors: "Smith, A. M. O., & Hess, J. L.",
            year: 1967,
            title: "Calculation of potential flow about arbitrary bodies",
            journal: "Progress in Aerospace Sciences",
            volume: "8",
            pages: "3–67",
            url: "https://doi.org/10.1016/0376-0421(67)90003-4",
        },
        {
            authors: "Rubin, S. G., & Graves, R. A.",
            year: 1975,
            title: "Viscous-inviscid interactions in external aerodynamics",
            journal: "Progress in Aerospace Sciences",
            volume: "16",
            pages: "1–106",
            url: "https://doi.org/10.1016/0376-0421(75)90002-2",
        },
        {
            authors: "ESDU 13013",
            year: 2014,
            title: "Viscous Full Potential (VFP) Method for Three-Dimensional Wings and Wing-Body Combinations. Part 1: Validation of results with experiment and comparisons with other methods contents",
            journal: "",
            volume: "",
            pages: "",
            url: "",
        },
        {
            authors: "ESDU 13012",
            year: 2014,
            title: "Viscous full-potential (VFP) method for three-dimensional wings and wing-body combinations Part 2: Use of VFPHE and related programs",
            journal: "",
            volume: "",
            pages: "",
            url: "",
        },
        {
            authors: "ESDU 02013",
            year: 2006,
            title: "Full-potential (FP) method for three-dimensional wings and wing-body combinations-inviscid flow Part 1: Principles and results",
            journal: "",
            volume: "",
            pages: "",
            url: "",
        },
        {
            authors: "Murman, E. M., & Cole, J. D.",
            year: 1971,
            title: "Calculation of plane steady transonic flows",
            journal: "AIAA Journal",
            volume: "9",
            pages: "114–121",
            url: "https://doi.org/10.2514/3.6131",
        },
        {
            authors: "Garabedian, P. R., & Korn, D. G.",
            year: 1971,
            title: "Numerical Design of Transonic Airfoils",
            journal: "Numerical Solution of Partial Differential Equations–II",
            volume: "",
            pages: "253-271",
            url: "https://www.sciencedirect.com/science/article/abs/pii/B9780123585028500128",
        },
        {
            authors: "Bertin, J. J., & Cummings, R. M.",
            year: 2025,
            title: "Compressible, Subsonic Flows and Transonic Flows",
            journal: "Aerodynamics for Engineers",
            volume: "",
            pages: "579-629",
            url: "https://doi.org/10.1017/9781009501293.010",
        },
        {
            authors: "Pasquale, D. D.",
            year: 2023,
            title: "Cranfield Viscous Full Potential 3D Aerodynamics Computation Code VFP Manual",
            journal: "",
            volume: "",
            pages: "",
            url: "",
        },
    ],
    "Propeller Wing Interference Model": [
        {
            authors: "Felli, M.",
            year: 2020,
            title: "Underlying mechanisms of propeller wake interaction with a wing",
            journal: "Journal of Fluid Mechanics",
            volume: "908",
            pages: "",
            url: "https://doi.org/10.1017/jfm.2020.792",
        },
        {
            authors: "Chandrasekaran, B.",
            year: 1985,
            title: "Method for the Prediction of the Installation Aerodynamics of a Propfan at Subsonic Speeds",
            journal: "NASA",
            volume: "",
            pages: "",
            url: "",
        },
        {
            authors: "Catalano, F. M., & Ceng, Mraes",
            year: "",
            title: "On the Effects of an Installed Propeller Slipstream on a Wing Boundary Layer",
            journal: "",
            volume: "",
            pages: "",
            url: "",
        },
        {
            authors: "Veldhuis, L. L. M.",
            year: 2004,
            title: "Review of Propeller-Wing Aerodynamic Interference",
            journal: "International Congress of the Aeronautical Sciences",
            volume: "",
            pages: "",
            url: "",
        },
        {
            authors: "Yang, Z., Kirby, A. C., & Mavriplis, D. J.",
            year: 2022,
            title: "Comparison of Propeller-Wing Interaction Simulation using Different Levels of Fidelity",
            journal: "",
            volume: "",
            pages: "",
            url: "http://arc.aiaa.org",
        },
        {
            authors: "Khan, W., & Nahon, M.",
            year: 2015,
            title: "Development and Validation of a Propeller Slipstream Model for Unmanned Aerial Vehicles",
            journal: "AIAA Journal",
            volume: "52",
            pages: "1985-1994",
            url: "https://doi.org/10.2514/1.C033118",
        },
        {
            authors: "Nederlof, R., Goyal, J., Sinnige, T., Ragni, D., & Veldhuis, L. L. M.",
            year: 2025,
            title: "Fast Numerical Modeling of Propeller–Wing Aerodynamic Interactions",
            journal: "AIAA Journal",
            volume: "63",
            pages: "2499-2519",
            url: "/doi/pdf/10.2514/1.J064764?download=true",
        },
        {
            authors: "ZHANG, Y., CHEN, H., & ZHANG, Y.",
            year: 2021,
            title: "Wing optimization of propeller aircraft based on actuator disc method",
            journal: "Chinese Journal of Aeronautics",
            volume: "34",
            pages: "65-78",
            url: "https://www.sciencedirect.com/science/article/pii/S1000936120306002",
        },
        {
            authors: "NASA",
            year: 1985,
            title: "Aerodynamic Effects of Propeller Slipstream on Lifting Surfaces",
            journal: "NASA Technical Reports Server",
            volume: "",
            pages: "",
            url: "",
        },
        {
            authors: "Jameson, A.",
            year: 1969,
            title: "The Analysis of Propeller Wing Flow Interaction",
            journal: "Analytic Methods in Aircraft Aerodynamics, NASA Symposium Proceedings",
            volume: "SP-228",
            pages: "721--749",
            url: "",
        },
        {
            authors: "Pflumm, T., Denzel, J., & Fichter, W.",
            year: 2022,
            title: "In-Flight Validation of Propeller Slipstream Model",
            journal: "2022 International Conference on Unmanned Aircraft Systems (ICUAS)",
            volume: "",
            pages: "",
            url: "https://ieeexplore.ieee.org/document/9836217/",
        },
        {
            authors: "Luderer, O., Jünemann, M., & Thielecke, F.",
            year: 2020,
            title: "Validation of an Aerodynamic Model for the Analysis of Subscale Test Aircraft with Distributed Electrical Propulsion",
            journal: "32nd ICAS Congress 2020/21",
            volume: "",
            pages: "",
            url: "https://www.icas.org/icas_archive/ICAS2020/data/papers/ICAS2020_0145_paper.pdf",
        },
        {
            authors: "Hospodář, P., Smolík, J., & Žabka, P.",
            year: 2018,
            title: "Wing and Propeller Aerodynamic Interaction through Nonlinear Lifting Line Theory and Blade Element Momentum Theory",
            journal: "MATEC Web of Conferences",
            volume: "233",
            pages: "00035",
            url: "https://www.matec-conferences.org/articles/matecconf/abs/2018/15/matecconf_iccsre2018_00035/matecconf_iccsre2018_00035.html",
        },
        {
            authors: "Aref, P., Ghoreyshi, M., Jirasek, A., & Satchell, M.",
            year: 2018,
            title: "Computational Study of Propeller--Wing Aerodynamic Interaction",
            journal: "2018 AIAA Aerospace Sciences Meeting",
            volume: "",
            pages: "",
            url: "https://arc.aiaa.org/doi/10.2514/6.2018-0778",
        },
    ],
    // Third category can be added later
};

function formatAPA(ref) {
    // Basic APA formatting for demonstration
    return (
        <span>
            {ref.authors} {ref.year && `(${ref.year}).`} <i>{ref.title}</i>
            {ref.journal && <>. <span>{ref.journal}</span></>}
            {ref.volume && <> <b>{ref.volume}</b></>}
            {ref.pages && <>, {ref.pages}</>}
            .
        </span>
    );
}

export default function Research() {
    const navigate = useNavigate();
    const logoSrc = `${import.meta.env.BASE_URL}flowVFP-logo.png`;

    return (
        <div
            className="min-h-screen flex flex-col"
            style={{
                background: "radial-gradient(ellipse 120% 100% at 50% 0%, #f5f9fd 60%, #eaf6ff 100%)",
            }}
        >
            {/* Header (same as LandingPage) */}
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
                        src={logoSrc}
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
                    <a href="#" className="hover:text-[#1e5bb8] transition-colors">Documentation</a>
                    <button
                        type="button"
                        className="hover:text-[#1e5bb8] transition-colors font-bold underline focus:outline-none"
                        style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}
                        onClick={() => navigate("/research")}
                    >
                        Research
                    </button>
                    <a href="#" className="hover:text-[#1e5bb8] transition-colors">Contact</a>
                </nav>
            </header>

            {/* Main Content */}
            <main className="flex flex-col items-center w-full">
                <h1 className="mt-12 text-4xl font-extrabold text-[#142d4c] text-center leading-tight drop-shadow-md">
                    Research & References
                </h1>
                <p className="mt-4 text-lg text-[#3a5a7c] text-center max-w-2xl">
                    Explore the foundational literature and research that underpin the FlowVFP solver and its modules.
                </p>

                <div className="w-full max-w-4xl mt-12 mb-20 px-4">
                    {Object.entries(references).map(([category, refs]) => (
                        <section key={category} className="mb-12">
                            <h2 className="text-2xl font-bold text-[#1e5bb8] mb-4 border-l-4 border-[#1e5bb8] pl-3">{category}</h2>
                            <ol className="list-decimal ml-8 space-y-4">
                                {refs.map((ref, idx) => (
                                    <li key={idx} className="text-[#142d4c] text-base leading-relaxed">
                                        {ref.url ? (
                                            <a
                                                href={ref.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:text-[#0ec3e0] underline transition-colors"
                                            >
                                                {formatAPA(ref)}
                                            </a>
                                        ) : (
                                            formatAPA(ref)
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </section>
                    ))}
                </div>
            </main>

            {/* Footer (same as LandingPage) */}
            <footer className="w-full bg-[#142d4c] mt-auto pt-10 pb-6 px-16">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="bg-white rounded-lg w-14 h-14 flex items-center justify-center shadow">
                            <img src={logoSrc} alt="VFP Flow Solver Icon" className="w-12 h-12 object-contain" />
                        </div>
                        <div>
                            <div className="text-lg font-bold text-white">FlowVFP Solver</div>
                            <div className="text-sm text-[#b3c2db]">Version 2.1</div>
                        </div>
                    </div>
                    <nav className="flex gap-12 text-base font-medium text-white">
                        <a href="#" className="hover:text-[#0ec3e0] transition-colors">Documentation</a>
                        <button
                            type="button"
                            className="hover:text-[#0ec3e0] transition-colors font-bold underline focus:outline-none"
                            style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}
                            onClick={() => navigate("/research")}
                        >
                            Research
                        </button>
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