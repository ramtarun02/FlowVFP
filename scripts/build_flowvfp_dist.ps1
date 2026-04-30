param(
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FrontendDir = Join-Path $Root "VFP-2025"
$BackendDir = Join-Path $Root "VFP-Python"
$FrontendBuildDir = Join-Path $FrontendDir "build"
$BackendFrontendDir = Join-Path $BackendDir "frontend_build"
$SpecPath = Join-Path $BackendDir "flowvfp-packaged.spec"
$InstallerScript = Join-Path $Root "installer\flowvfp.iss"

Write-Host "[1/5] Building packaged frontend"
Push-Location $FrontendDir
npm install
npm run build:packaged
Pop-Location

Write-Host "[2/5] Staging frontend build into backend bundle"
if (Test-Path $BackendFrontendDir) {
    Remove-Item -Recurse -Force $BackendFrontendDir
}
New-Item -ItemType Directory -Path $BackendFrontendDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $FrontendBuildDir "*") $BackendFrontendDir

Write-Host "[3/5] Installing backend packaging dependencies"
Push-Location $BackendDir
python -m pip install -r requirements.txt
python -m pip install pyinstaller

Write-Host "[4/5] Building self-contained portable bundle"
python -m PyInstaller --noconfirm --clean $SpecPath
Pop-Location

$PortableDir = Join-Path $BackendDir "dist\FlowVFP"
Write-Host "Portable artifact ready: $PortableDir"

if ($SkipInstaller) {
    Write-Host "Installer step skipped by -SkipInstaller"
    exit 0
}

Write-Host "[5/5] Building installer (if Inno Setup is available)"
$IsccPath = Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"
if (-not (Test-Path $IsccPath)) {
    Write-Warning "Inno Setup not found. Install Inno Setup 6 to generate setup.exe."
    Write-Warning "Portable build is complete at: $PortableDir"
    exit 0
}

& $IsccPath "/DSourceDir=$PortableDir" "/DMyAppVersion=2.0.0" $InstallerScript
Write-Host "Installer build complete."
