#ifndef SourceDir
  #define SourceDir "..\\VFP-Python\\dist\\FlowVFP"
#endif

#ifndef MyAppVersion
  #define MyAppVersion "2.0.0"
#endif

#define MyAppName "FlowVFP"
#define MyAppExeName "FlowVFP.exe"

[Setup]
AppId={{9B62A9A3-99E4-4B04-BA6A-B56C0A3D3479}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=..\VFP-Python\dist\installer
OutputBaseFilename=FlowVFP-Setup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
PrivilegesRequired=admin

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
