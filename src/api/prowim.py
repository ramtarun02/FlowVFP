"""
ProWiM API Blueprint
=====================
Propeller / wing interference model computations.
"""
from __future__ import annotations

import logging
import math

import numpy as np
from flask import Blueprint, jsonify

from ..extensions import limiter
from ..utils.validators import PROWIM_SCHEMA, validate_json

logger = logging.getLogger("vfp.prowim")

prowim_bp = Blueprint("prowim", __name__)


# ── Core computations ─────────────────────────────────────────────────────────

def _compute_KS0D(CL0: np.ndarray, CD0: np.ndarray, A: float) -> np.ndarray:
    factor = 2 / (math.pi * A)
    term1  = (factor * CL0) ** 2
    term2  = (1 - factor * CD0) ** 2
    return np.round(1 - np.sqrt(term1 + term2), 7)


def _compute_TS0D(CL0: np.ndarray, CD0: np.ndarray, A: float) -> np.ndarray:
    factor = 2 / (math.pi * A)
    return np.round(np.degrees(np.arctan((factor * CL0) / (1 - factor * CD0))), 3)


# ── Route ─────────────────────────────────────────────────────────────────────

@prowim_bp.post("/compute")
@limiter.limit("60 per minute")
@validate_json(PROWIM_SCHEMA)
def compute(data: dict):
    """
    Execute the ProWiM propeller / wing interaction model and return the
    resultant force coefficients (*CZ*, *CZD*, *CX*, *CXD*, …) for each
    operating point supplied in the arrays ``CL0``, ``CD0``, ``ALFAWI``.
    """
    r2   = lambda v: round(float(v), 2)
    r1   = lambda v: round(float(v), 1)
    r3   = lambda v: round(float(v), 3)
    r5   = lambda v: round(float(v), 5)
    arr2 = lambda s: np.round(np.array(s, dtype=float), 2)
    arr3 = lambda s: np.round(np.array(s, dtype=float), 3)

    A      = r3(data["A"])
    bOverD = r3(data["bOverD"])
    cOverD = r3(data["cOverD"])
    N      = r3(data["N"])
    NSPSW  = r3(data["NSPSW"])
    ZPD    = r3(data["ZPD"])
    CT     = r3(data["CTIP"])
    NELMNT = r3(data["NELMNT"])

    alpha0 = r2(data["alpha0"])
    IW     = r2(data["IW"])

    if NELMNT != 0:
        return jsonify(error="NELMNT must be 0; non-zero values are not yet supported"), 400

    CL0    = arr3(data["CL0"])
    CD0    = arr3(data["CD0"])
    KS00   = arr3(data["KS00"])  # noqa: assigned but used only for completeness
    ALFAWI = arr2(data["ALFAWI"])

    KS0D = np.round(_compute_KS0D(CL0, CD0, A), 3)
    TS0D = np.round(_compute_TS0D(CL0, CD0, A), 2)

    Hzp = r2(1 - 2.5 * abs(ZPD))
    Kdc = r2(-1.630 * cOverD**2 + 2.3727 * cOverD + 0.0038)
    Izp = r1(
        455.93 * ZPD**6
        - 10.67 * ZPD**5
        - 87.221 * ZPD**4
        - 3.2742 * ZPD**3
        + 0.2309 * ZPD**2
        + 0.0418 * ZPD
        + 1.0027
    )

    TS0Ap0_1d = r2(-2 * Kdc * alpha0)
    TS10 = np.round(Hzp * TS0Ap0_1d + 1.15 * Kdc * Izp * IW + (ALFAWI - IW), 2)

    theta_s = np.round(
        TS0D + (CT + 0.3 * np.sin(np.radians(180 * float(CT) ** 1.36))) * (TS10 - TS0D),
        2,
    )

    ks = np.round(KS0D, 3)
    r  = r5(math.sqrt(max(0.0, 1 - CT)))

    theta_rad = np.radians(theta_s)
    TS0D_rad  = np.radians(TS0D)
    alpha_p   = np.round(ALFAWI - IW, 2)

    CZ    = np.round(
        (1 + r) * (1 - ks) * np.sin(theta_rad)
        + ((2 / N) * bOverD**2 - (1 + r)) * r**2 * (1 - ks) * np.sin(TS0D_rad),
        3,
    )
    CZwf  = np.round(CZ  - CT * np.sin(np.radians(alpha_p)), 3)
    CZDwf = np.round(CZwf * NSPSW / (1 - CT), 3)
    CZD   = np.round(CZ   * NSPSW / (1 - CT), 3)

    CX    = np.round(
        (1 + r) * ((1 - ks) * np.cos(theta_rad) - r)
        + ((2 / N) * bOverD**2 - (1 + r)) * r**2 * ((1 - ks) * np.cos(TS0D_rad) - 1),
        3,
    )
    CXwf  = np.round(CX  - CT * np.cos(np.radians(alpha_p)), 3)
    CXDwf = np.round(CXwf * NSPSW / (1 - CT), 3)
    CXD   = np.round(CX   * NSPSW / (1 - CT), 3)

    results = [
        {
            "KS0D":  r5(KS0D[i]),
            "TS0D":  r5(TS0D[i]),
            "theta_s": r5(theta_s[i]),
            "ks":    r5(ks[i]),
            "CZ":    r5(CZ[i]),
            "CZwf":  r5(CZwf[i]),
            "CZDwf": r5(CZDwf[i]),
            "CZD":   r5(CZD[i]),
            "CX":    r5(CX[i]),
            "CXwf":  r5(CXwf[i]),
            "CXDwf": r5(CXDwf[i]),
            "CXD":   r5(CXD[i]),
        }
        for i in range(len(CL0))
    ]

    return jsonify(results=results)
