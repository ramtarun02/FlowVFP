# Viscous Full Potential Flow Solver


## Table of Contents

- [Viscous Full Potential Flow Solver](#viscous-full-potential-flow-solver)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Purpose](#purpose)
  - [Target Audience](#target-audience)
  - [Key Advantages over Legacy VFP CLI/MATLAB GUI](#key-advantages-over-legacy-vfp-climatlab-gui)
- [Getting Started](#getting-started)
  - [System Requirements](#system-requirements)
  - [Installation](#installation)
    - [2.2.1 Accessing the Web Application (End Users)](#221-accessing-the-web-application-end-users)
    - [2.2.2 Local Installation (Developers/Administrators)](#222-local-installation-developersadministrators)
  - [2.3 Starting the Application](#23-starting-the-application)
  - [Modules and Components](#modules-and-components)
    - [Geometry Module](#geometry-module)
      - [Salient Features](#salient-features)
      - [Specifications of Wing Geometry File](#specifications-of-wing-geometry-file)
      - [Modifying Wing Planform Parameters (Compute Desired Function)](#modifying-wing-planform-parameters-compute-desired-function)
      - [Improving Wing Planform Parameters (Improve Function)](#improving-wing-planform-parameters-improve-function)
      - [FPCON - Generating VFP Input Files](#fpcon---generating-vfp-input-files)
        - [Important Notes and Best Practices](#important-notes-and-best-practices)
  - [References](#references)


## Overview 

The VFP (Viscous Full Potential) Web Application is a modern, browser-based computational fluid dynamics (CFD) tool designed for conceptual aircraft design. This application replaces the legacy MATLAB-based GUI with a scalable, cross-platform web solution built using ReactJS for the frontend and Python for the backend server. The VFP (Viscous Full Potential) Web Application is a modern, browser-based computational fluid dynamics (CFD) tool designed for transonic aircraft design. This application replaces the legacy MATLAB-based GUI with a scalable, cross-platform web solution built using ReactJS for the frontend and Python for the backend server.



## Purpose 

The VFP Web Application aims to:

- Provides an efficient and interactive graphical user interface for the legacy VFP CLI developed by ESDU.
- Enable efficient geometry visualisation, modifications and performance evaluations
- Supports Generation of VFP Input Files by integrated FPCON
- Auto Runner -- Enables Users to simulate continuation run through a range og angle of attacks.
- Facilitate multi-user, collaborative workflows through web-based access
- Support integration of propeller-wing interference modeling (ProWIM)
- Eliminate platform dependencies (Windows-only constraint of the original MATLAB/Fortran implementation)

## Target Audience

This application is designed for:

- **Aerospace engineers** conducting conceptual/preliminary aircraft design
- **Researchers** studying potential flows and boundary layer.
- **Students** learning CFD and aircraft design principles
- **Design teams** requiring collaborative and rapid aerodynamic analysis tools

## Key Advantages over Legacy VFP CLI/MATLAB GUI

- Provides an efficient and interactive graphical user interface for the legacy VFP CLI developed by ESDU.
- Enable efficient geometry visualisation, modifications and performance evaluations
- **Integrated FPCON**: Supports Generation of VFP Input Files by integrated ESDU's FPCON
- **Auto Runner** -- Enables Users to simulate continuation run through a range of angle of attacks.
- **Cross-platform accessibility**: Works on Windows, macOS, and Linux via web browser
- **Multi-user support**: Enables simultaneous access by multiple team members
- **Improved performance**: Enhanced responsiveness and computational efficiency
- **Modern UI/UX**: Intuitive interface with contemporary design patterns
- **No licensing costs**: Open-source technology stack eliminates proprietary software fees
- **Cloud deployment ready**: Can be hosted on institutional or cloud servers

# Getting Started

Welcome to the Aircraft Design and Optimization Tool! This guide will help you set up and start using the application, even if you have limited experience with software installation.

## System Requirements

**Minimum Requirements:**

- **Modern web browser (Chrome, Firefox, Safari, Edge)**
- **Internet connection (for web-hosted deployment)**


**For Local Installation:**

- **Git:** Used to clone repositories; check installation by running `git --version` in your terminal.
- **Node.js 16.x or higher, npm 7.x or higher (Frontend):** Required to run and build the frontend; check with `node -v` and `npm -v`.
- **Python 3.8 or higher, pip package manager (Backend):** Needed for backend server; check with `python --version` and `pip --version`.
- **Operating System (Windows 10/11, macOS 10.15+, or Linux Ubuntu 20.04+)**
- **RAM: 4GB minimum, 8GB recommended** 
- **Disk Space: 20GB free space**


## Installation

### 2.2.1 Accessing the Web Application (End Users)

The application is deployed online via GitHub Pages. To access the VFP Web Application, simply navigate to the following URL in your web browser—no local installation required.

**VFP Application URL:** [https://ramtarun02.github.io/VFP-2025](https://ramtarun02.github.io/VFP-2025)

### 2.2.2 Local Installation (Developers/Administrators)

#### Step 1: Clone the Frontend Repository <!-- omit from toc -->
```bash
git clone https://github.com/ramtarun02/VFP-2025.git
cd VFP-2025
```
#### Step 2: Frontend Setup <!-- omit from toc -->
```bash
# Navigate to frontend directory (from project root)
cd VFP-2025

# Install dependencies
npm install
```

#### Step 3: Clone and Set Up the Backend Server <!-- omit from toc -->
The backend server is now maintained in a separate repository. Clone and set up the backend as follows:

```bash
git clone https://github.com/ramtarun02/VFP-Python.git
cd VFP-Python

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## 2.3 Starting the Application

**Step 1: Start the Backend Server** <!-- omit from toc -->
```bash
cd VFP-Python
# Activate virtual environment (Make Sure the venv is activated everytime you start the backend server)
venv\Scripts\activate  # On Windows
# or
source venv/bin/activate  # On macOS/Linux

# Set Flask app environment variable (Only Needed when setting up for the first time)
set FLASK_APP=src/app.py        # On Windows
# or
export FLASK_APP=src/app.py     # On macOS/Linux

# Start the Flask development server
flask run
```

The backend server will start on http://localhost:5000

**Step 2: Start the Frontend Development Server** <!-- omit from toc -->
In the frontend folder (VFP-2025), run 
```bash 
npm run dev
```

The VFP Application will open in a new browser window/tab with an URL http://localhost:3000

## Modules and Components

The VFP-2025 Web Application is structured into three primary modules: Geometry, Solver, and VFP-Post. Each module is designed to encapsulate a distinct phase of the aerodynamic analysis workflow, with dedicated components that deliver specialized functionality. Components within each module are responsible for specific tasks such as file generation, visualization, computation, and post-processing. This modular approach ensures clarity, maintainability, and scalability, allowing users to focus on specific tasks while benefiting from a cohesive user experience.

- **Geometry Module:** Facilitates the import, visualization, and modification of aircraft wing geometry, and supports the generation of solver input files.
- **Solver Module:** Manages the setup, execution, and monitoring of aerodynamic simulations, including file uploads and real-time feedback.
- **VFP-Post Module:** Provides advanced post-processing tools for analyzing simulation results, including contour plotting, boundary layer visualization, and propeller-wing interference modeling.

![VFP Application Home Page](/screenshots/vfp-home.png)

### Geometry Module

The Geometry Module is the starting point for any aerodynamics analysis in VFP. It allows users to interactively manage the wing geometry files, modify the airfoil sections and wing planforms and also allows user to generate VFP input files - Geometry File (.GEO), Mapping File (.MAP) and Flow File (.DAT) achieved by integrating the ESDU's FPCON. 

#### Salient Features

- **Multiple geometry File Handling**: The Geometry Module allows users to import and manage multiple .GEO files within a single session. This enables direct comparison of different wing configurations side-by-side. Upon upload, each geometry file is parsed and converted into two key data structures: geoData (containing the raw geometry parameters and section details) and plotData (a JSON object optimized for visualization). This architecture supports rapid switching between files and facilitates comparative design analysis.

- **Interactive Visualization**: Visualization is powered by Plotly JS, integrated through dedicated React components (Plot2D and Plot3D). Users can interactively explore both 2D planform and 3D wing representations, with features such as save plot to .PNG, and plot interactions such as zoom, pan and rotate. Any modifications made to the geometry—whether section parameters or batch improvements—are instantly reflected in the plots, providing immediate visual feedback and validation of design changes.
  
- **Section-Based Editing**: The wing geometry is organized as a series of control sections distributed across the span. Each section is characterized by its spanwise position (YSECT), leading (XLE) and trailing edge (ZLE) coordinates, vertical displacement (HSECT), and orientation parameters (TWSIN, XTWSEC). Users can select individual sections and modify their defining parameters with precision, allowing for localized adjustments to the wing configuration.

- **Batch Parameter Improvement**: Beyond individual section editing, the module provides interpolation tools for applying systematic variations across multiple sections of the geometry file. Current version of the VFP application allows users linear and quadratic interpolation schemes on twist, dihedral and leading edge. This functionality allows user to optimse the wing planform for maximum performance. 
  
- **Automatic Wing Specification Calculation**: The module continuously computes and displays essential wing metrics based on the current geometry definition. These include fundamental parameters such as aspect ratio, reference span, planform area, taper ratio, and the total number of control sections. This real-time feedback ensures that users maintain awareness of how their modifications affect overall wing characteristics.

- **Integrated FPCON Component**: A dedicated interface is provided for generating complete solver input file sets. This component collects geometry specifications along with aerodynamic parameters and section details, then produces properly formatted input files compatible with the computational solver. The integration streamlines the workflow from geometry module to solver module.

#### Specifications of Wing Geometry File

The Geometry file (.GEO) specifies the complete 3D configuration of the wing, and optionally the body for computational analysis. The geometry file is organized hierarchically, beginning with overall control parameters followed by detailed section-by-section specifications. The file starts with a header line that specifies the total number of sections across the span (NSECT) and parameters governing interpolation between these sections.

Sections must be specified in order of increasing spanwise coordinate, starting from y = 0 (the configuration centerline and control section, this section has to be on the symmetry plane). Each section is defined by its spatial position (spanwise location YSECT, leading edge coordinate G1SECT, trailing edge coordinate G2SECT, twist angle TWSIN about the chordwise poistion, XTWSEC and vertical displacement HSECT) along with its geometric profile specified by coordinate pairs (XSECT, ZSECT) that trace the section profile. Sections can be marked to indicate whether their coordinate distribution differs from the adjacent inboard section (IMARK parameter), enabling efficient data specification by allowing coordinate reuse where appropriate.

When a body is present in the configuration, its geometry is specified through a series of stations distributed along the streamwise axis. Each station provides the streamwise coordinate (XRAD) and corresponding body radius (RAD). The body is assumed to possess rotational symmetry about the streamwise axis. Setting NRAD = 0 indicates a wing-alone case with no body present.

**Several important constraints govern the geometry specification:**

- The geometry file extension is case sensitive, i.e., .GEO is the accepted file format for the VFP application
- The total number of control sections must satisfy: 2 ≤ NSECT ≤ 38
- Sections must start at y = 0 and finish at the true wing tip
- For wing-body configurations, sections are defined from the centerline, not from the wing-body junction
- Maximum coordinate pairs per surface: 125 for upper (MU) and 125 for lower (ML)


> **Note** - For detailed specification of the .GEO file format, including line types, parameter definitions, interpolation methods, and formatting requirements, users are strongly encouraged to refer to Section 4.1 (Specification of the Geometry File, GEO.DAT) in the ESDU 02014 [^1] document.

The Geometry Module streamlines interaction with this file structure by providing an intuitive interface for viewing and modifying these parameters without requiring direct file editing or detailed knowledge of the underlying format conventions.

#### Modifying Wing Planform Parameters (Compute Desired Function)

Compute Desired Function, in the controls panel, allows the user to modify the sections of the wing geometry. Follow the steps below to modify the wing sections: 

- **Step 1: Import and Select Geometry File**  
  Import the  geometry file into the Geometry Module. If more than one geometry files are uploaded in the module, then use the 3D Plot File dropdown menu in the Plot Options panel to select the desired geometry file.  

- **Step 2: Choose a Wing Section**  
  Use the Section dropdown in the Plot Options panel to choose the specific wing section that needs to be modified. The Controls panel on the left, will show the baseline (original) values for all editable parameters of the selected section. Make sure the controls panel displays the correct geometry file and section on the top of the parameter field. Toggle the Section 2D plot in the Plot Type Panel to display the section in the Plot2D component and untick any other geometry file in the 2D Plot Files chekcboxes to focus only on the desired wing geometry. 
- **Step 3: Edit Section Parameters**  
  In the Controls Panel, enter new values for desired parameters such as: Twist, Dihedral, YECT, XLE, XTE and Chord.

- **Step 4: Applying Changes**  
  - After entering your modifications, click Compute Desired.  It is recommended that when modifying YSECT, XLE, XTE or chord, toggle the planform view in the Plot Options panel (right) so that the user can see the modification reflecting in the planform shape. It has to be noted that modifying the twist rotates the section coordinates about the XTWSEC value of that section.
  
  - The updated parameters are sent to the backend, which recalculates the geometry and updates both the `geoData` and `plotData` structures. The changes appear instantly in the Plot2D component an wing specifications panel, enabling immediate feedback on your edits.

- **Step 5: Review Updated Geometry**  
  Examine the wing section using the plot2D component by selecting the "Section" plot type in the plot type. Users can also select "Twist" or "Dihedral" as plot type, to analyse the twist or dihedral of the wing planform. The modified plot will be shown as a dashed line. You may switch between sections or files to compare modifications.

- **Step 6: Exporting and Reset**  
  Once the desired modifications are applied to the wing sections, users can click on Export GEO File option to export the geometry file (.GEO), which can be direclty taken to the solver module, with appropriate mapping and flow file. To discard all changes and revert the geometry to its original state, click Reset.

> **Note:** The Reset button erases all modifications made during the session, including changes to sections other than the currently selected one. This action restores the geometry file to its baseline state, so use it with caution if you have made multiple edits.

![Compute Desired Function](/screenshots/compute-desired.png)


#### Improving Wing Planform Parameters (Improve Function)

The Improve Function enables users to apply systematic, batch modifications to wing section parameters using linear or quadratic interpolation. This is particularly useful for optimizing twist, dihedral, or leading edge position across a range of sections. Follow the steps below to use the Improve Function effectively:

- **Step 1: Import and Select Geometry File**  
  Import the desired geometry file into the Geometry Module. If multiple geometry files are present, use the 3D Plot File dropdown in the Plot Options panel to select the file you wish to improve.

- **Step 2: Choose Parameter and Section Range**  
  In the Improve panel, select the parameter to be improved (Twist, Dihedral, or X Leading Edge) from the dropdown menu. Specify the start and end sections for the interpolation. This defines the range over which the improvement will be applied.

- **Step 3: Set Interpolation Method and Value**  
  Choose the interpolation method—linear or quadratic—by entering the coefficient `a` for quadratic interpolation (leave as zero for linear). The formula used is `y = ax² + bx + c`, allowing for both linear and quadratic transitions. Adjust the value as needed to achieve the desired gradient or curvature in the parameter across the selected sections.

- **Step 4: Apply Improvement**  
  Click the **Improve** button to apply the interpolation. The backend processes the request, recalculates the geometry, and updates both the `geoData` and `plotData` structures. The changes are instantly reflected in the Plot2D and Plot3D components, providing immediate visual feedback on the improved parameter distribution.

- **Step 5: Review Improved Geometry**  
  Use the plot2D and plot3D components to inspect the updated wing geometry. Select relevant plot types (e.g., Twist or Dihedral) to analyze the effect of the improvement across the span. The modified parameter profile will be shown as a dashed line, allowing for easy comparison with the baseline.

- **Step 6: Exporting and Reset**  
  After confirming the improvements, you can export the updated geometry file using the Export GEO File option. If you wish to discard all batch changes and revert to the original geometry, click the **Reset** button.

> **Note:**- The Reset button in the main module erases all geometry edits—including section data—restoring the baseline state. Use with caution to avoid data loss during multi-step inputs.


#### FPCON - Generating VFP Input Files

The FPCON (Full Potential CONfiguration) component enables users to generate the VFP input files, provided the users have the wing planform section data. The approach follows a parameter-driven, section-based workflow as described in Section 5 in ESDU 02014 [^1] for wing geometry definition.


![FPCON](/screenshots/fpcon.png)


- **Overview of the Interface:**  
The FPCON (Full Potential CONfiguration) Wing Geometry Input is an integral component for defining aerodynamic wing parameters in a structured, section-based manner. The input dialog collects both global geometry settings—such as aspect ratio, sweep angle, Mach number, and number of wing sections—and detailed section data via a tabular interface (covering values like Etas, HSECT, twist, and local incidence). Users can enter parameters manually then submit the configuration for geometry calculation and download teh files once the calculation is complete.


##### Important Notes and Best Practices

- Specify all mandatory fields, as incomplete submissions may result in errors or failed computations.
- To modify or refine geometry, return to the FPCON panel, update parameters, and resubmit as needed.
- Using multiple sections (higher NSECT) allows for more accurate representation of non-planar or non-uniform wings.
- For parametric studies, duplicate previously successful configurations and change one parameter at a time for best traceability.
 
## References

[^1]: Full-potential (FP) method for three-dimensional wings and wing-body combinations – inviscid flow Part 2: Use of FP and related programs ESDU 02014