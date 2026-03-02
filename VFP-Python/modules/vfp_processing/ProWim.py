
import math 


def get_float_input(prompt):
    while True:
        try:
            return float(input(prompt))
        except ValueError:
            print("Invalid input. Please enter a number.")

def get_int_input(prompt):
    while True:
        try:
            return int(input(prompt))
        except ValueError:
            print("Invalid input. Please enter an integer.")

def get_list_input(prompt, count):
    values = []
    for i in range(count):
        values.append(get_float_input(f"{prompt} [{i+1}/{count}]: "))
    return values

def compute_KS0D(CL0, CD0, A):
    import math
    return 1 - math.sqrt(((2 * CL0) / (3.14159 * A))**2 + (1 - (2 * CD0) / (3.14159 * A))**2)

def compute_TS0D(CL0, CD0, A):
    import math
    return math.degrees(math.atan((2*CL0/(math.pi * A))/(1 - (2*CD0/(math.pi * A)))))




def main():
    data = {}
    data["A"] = get_float_input("Enter Wing Aspect Ratio (A): ")
    data["b/D"] = get_float_input("Enter Ratio of wing span to propeller disc diameter (b/D): ")
    data["c/D"] = get_float_input("Enter Ratio of wing chord at propeller station to propeller disc diameter (c/D): ")
    data["alpha0"] = get_float_input("Enter Angle of attack at zero lift (ALPHA0) in degrees: ")
    data["N"] = get_int_input("Enter Total number of propellers (N): ")
    data["NSPSW"] = get_float_input("Enter Ratio of total propeller disc area to wing planform area (NSPSW): ")
    data["ZPD"] = get_float_input("Enter Ratio of height of propeller shaft axis above wing leading edge to propeller disc diameter (ZPD): ")
    data["IW"] = get_float_input("Enter Angle between wing chord and propeller shaft axis (IW) in degrees: ")
    data["NELMNT"] = get_int_input("Enter Number of flap elements (NELMNT) [0=flaps-up, 1=single flap, 2=double flaps]: ")
    
    if data["NELMNT"] == 1:
        data["CTC"] = get_float_input("Enter Ratio of chord of single flap element to wing chord (CTC): ")
        data["DELTA"] = get_float_input("Enter Deflection of single flap element (DELTA) in degrees: ")
    elif data["NELMNT"] == 2:
        data["CT1C"] = get_float_input("Enter Ratio of chord of first flap element to wing chord (CT1C): ")
        data["DELTT1"] = get_float_input("Enter Deflection of first flap element (DELTT1) in degrees: ")
        data["CT2C"] = get_float_input("Enter Ratio of chord of second flap element to wing chord (CT2C): ")
        data["DELTT2"] = get_float_input("Enter Deflection of second flap element (DELTT2) in degrees: ")
    
    if data["NELMNT"] in [1, 2]:
        data["YCD"] = get_float_input("Enter Ratio of flap cut-out to propeller disc diameter (YCD): ")
        data["MSEAL"] = get_int_input("Enter Sealing marker for flap cut-out (0=not well-sealed, 1=well-sealed): ")
    
    data["MOVRLP"] = get_int_input("Enter Propeller overlap marker (0=not overlapped, 1=overlapped): ")
    data["NCT"] = get_int_input("Enter Number of cases of propeller thrust coefficient (NCT, max 10): ")
    if data["NCT"] > 0:
        data["CTIP"] = get_list_input("Enter Propeller thrust coefficient", data["NCT"])
    
    data["NAW"] = get_int_input("Enter Number of cases of angle of attack of section chord line at propeller station (NAW, max 10): ")
    if data["NAW"] > 0:
        data["ALFAWI"] = get_list_input("Enter Angle of attack of section chord line at propeller station (ALFAWI) in degrees", data["NAW"])
        data["CL0"] = get_list_input("Enter Nacelle/wing/flap lift coefficient without slipstream (CL0)", data["NAW"])
        data["CD0"] = get_list_input("Enter Nacelle/wing/flap drag coefficient without slipstream (CD0)", data["NAW"])
        data["KS00"] = get_list_input("Enter Slipstream viscous loss parameter at power-off and flaps-up condition", data["NAW"])
        data["KS0D"] = [compute_KS0D(data["CL0"][j], data["CD0"][j], data["A"]) for j in range(data["NAW"])]
        data["TS0D"] = [compute_TS0D(data["CL0"][j], data["CD0"][j], data["A"]) for j in range(data["NAW"])]
    
    print("\nCollected Data:")
    for key, value in data.items():
        print(f"{key}: {value}")
   

    Hzp = 1 - 2.5 * abs(data["ZPD"])

    Kdc = 0.87  # Estimation Required

    Izp = 1  # Estimation Required

    TS0Ap0_1d = -2 * Kdc * data["alpha0"]

    TS10 = Hzp*TS0Ap0_1d + 1.15 * Kdc * Izp * data["IW"] + (data["ALFAWI"][0] - data["IW"])

    print(TS10)


    # Given values
    ks1_0 = data["KS00"][0]  # From Equation (5.10)

    # Compute final [ks1]^δ
    ks10 = data["KS00"][0]

    print(ks10)


    # Given values
    theta_s_0 = data["TS0D"][0]  # Initial theta_s value
    CT = 0.3  # Given thrust coefficient
    theta_s1_0 = TS10  # Given value
    exponent = 1.36  # Exponent from equation
    
    # Compute theta_s
    theta_s = theta_s_0 + (CT + 0.3 * math.sin(math.radians(180 * CT**exponent))) * (TS10 - theta_s_0)
    print(f"Estimated theta_s: {theta_s:.2f} degrees")
    
    # Given values for ks
    ks_0 = data["KS0D"][0]  # Given
    
    # Compute ks
    ks = ks_0 + CT * (ks10 - ks_0)
    print(f"Estimated ks: {ks:.3f}")


    r = math.sqrt((1-CT))

    # Compute CZ
    CZ = (1 + r) * (1 - ks) * math.sin(math.radians(theta_s)) + ((2/data["N"]) * (data["b/D"])**2 - (1 + r)) * r**2 * ((1 - ks1_0)) * math.sin(math.radians(data["TS0D"][0]))
    print(f"Estimated CZ: {CZ:.3f}")

    # Compute CZwf
    alpha_p = 3  # Given
    CZwf = CZ - CT * math.sin(math.radians(alpha_p))

    CZDwf = CZwf * data["NSPSW"] /(1 - CT)
    print(f"Estimated CZwf: {CZwf:.3f}")


    # Compute CX
    CX = (1 + r) * ((1 - ks)*math.cos(math.radians(theta_s)) - r) + ((2/data["N"]) * (data["b/D"])**2 - (1 + r)) * r**2 * ((1 - ks1_0) * math.cos(math.radians(data["TS0D"][0])) - 1)
    print(f"Estimated CX: {CX:.3f}")


if __name__ == "__main__":
    main()
