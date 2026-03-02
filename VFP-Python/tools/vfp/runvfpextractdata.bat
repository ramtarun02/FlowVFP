echo off
title "vfpexcresdata4 program" 
color 9F
:vfp_input
set /p _vfp=enter file name of VFP ouput file 
if not exist %_vfp%.cp (echo file was not found)  
if not exist %_vfp%.vis (echo file was not found)  
if not exist %_vfp%.flow (echo file was not found)  
if not exist %_vfp%.cp goto :vfp_input  
copy %_vfp%.cp extractcp
copy %_vfp%.vis extractvis
copy %_vfp%.flow extractre
vfpextract.exe
echo 'selected VFP data extracted
pause
