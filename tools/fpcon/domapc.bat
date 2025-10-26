rem    does repeated mappings and stores in record.dat
     COPY MAP.DAT MAPNEW.DAT
     copy zero.dat achend.dat
     copy zero.dat record.dat
     :contin
     con1
    if not exist ACHEND.DAT goto end
    copy mapnew.dat map.dat
rem    copy geonew.dat geo.dat
    find.exe
    copy mapmod.dat map.dat
    maponly
    GRIDPROC
rem    goto end
    goto contin
    :end
