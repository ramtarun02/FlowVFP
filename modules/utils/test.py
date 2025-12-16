import VFP_File_Generation_Utils as u


flowfile = r"C:\Users\Tarun.Ramprakash\Downloads\VFP-Python\data\Simulations\CRM-Tail-080M-2\M080Re5p0ma0p00.DAT"
d = 0.25
n = -2
u.run_aoa_generation(flowfile, d, n)
