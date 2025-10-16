def readdat(filename):
    dat = {}
    
    with open(filename, 'r') as f:
        lines = f.readlines()
    

    print(lines)
    # i = 0
    # title = lines[i].strip()
    # i += 1

    # l = lines[i].split()
    # M_inc = int(l[1])
    # i += 1

    # M_Span2 = []
    # if M_inc != 0:
    #     for _ in range(M_inc):
    #         l1 = lines[i].strip().split()
    #         M_Span2.append([l1[1], l1[2]])
    #         i += 1

    # p = 1
    # while True:
    #     l = lines[i].split()
    #     if int(l[1]) == 0:
    #         break

    #     NXTCRD = l[1]
    #     IOPT1 = l[2]
    #     gridref = IOPT1[1]
    #     iterations = l[3]
    #     M = l[4]
    #     alpha = l[5]
    #     x_pitching = l[6]
    #     i += 2  # Skip one line and go to next

    #     l = lines[i].split()
    #     next_val = int(l[1])
    #     i += 1
    #     while next_val > 1:
    #         l = lines[i].split()
    #         next_val = int(l[1])
    #         i += 1

    #     IVINC = lines[i].split()[1]
    #     i += 1

    #     l = lines[i].split()
    #     preRe = l[0] if l[0] else l[1]
    #     Re = preRe[:-1]
    #     i += 1

    #     l = lines[i].split()
    #     total_trans = int(l[1]) + int(l[2])
    #     i += 1

    #     transitions = []
    #     for _ in range(total_trans):
    #         l = lines[i].split()
    #         transitions.append([float(l[1]), float(l[2]), float(l[3]), float(l[4])])
    #         i += 1

    #     l = lines[i].split()
    #     i += 1

    #     M_name = ''.join([c for idx, c in enumerate(M) if idx < 2 or c != '0'])
    #     a_name = ''.join([c for idx, c in enumerate(alpha) if idx < 2 or c != '0'])
    #     R_name = str(float(Re) / 1e6)

    #     name = f"dat.M{M_name}Re{R_name}a{a_name}i{iterations}g{gridref}s{p}"
    #     dat[name] = {
    #         'grid': gridref,
    #         'alpha': alpha,
    #         'M': M,
    #         'Re': Re,
    #         'iterations': iterations,
    #         'IVINC': IVINC,
    #         'transition': transitions,
    #         'x_pitch': x_pitching,
    #         'Minc': M_inc
    #     }

    #     if M_inc != 0:
    #         dat[name]['M_Span2'] = M_Span2

    #     p += 1

    # return dat

