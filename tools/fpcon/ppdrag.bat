rem following copy command assumes FPIBE has been run
rem if FP has been run then make it a remark, not a command

copy bflow.res flow.res

rem vortex drag post processing programs
prodvort.exe
copy vort1.dat vort.dat
vortd.exe

rem run three progs to get upper surface wave drag
rem  from flow.res
combine5.exe
copy ge87003u.dat wave.geo
copy jmax.dat overnos.dat
copy jfile.dat spanind.dat
copy etaxcpu.dat etaetc.dat

sortlistsa.exe

copy out2.dat shock1.dat
copy shock1.dat shock1.us
supp.exe
copy shock.dat shock.us
wav87003.exe

copy wavepr.res waveprus.dat
copy cdwtots.dat cdwtotus.dat

rem  run three progs to get lower surface wave drag
rem  from flow.res
combine5.exe
copy ge87003l.dat wave.geo
copy jmax.dat overnos.dat
copy jfile.dat spanind.dat
copy etaxcpl.dat etaetcl.dat

sortlistla.exe

copy out2l.dat shock1.dat
copy shock1.dat shock1.ls
supp.exe
copy shock.dat shock.ls

wav87003m.exe

copy wavepr.res waveprls.dat
copy cdwtots.dat cdwtotls.dat
copy curv.dat curvls.dat
                                 
rem run prog that gathers the data into the file ovdrag.res
gather.exe
