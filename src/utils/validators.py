"""
Request Validators
==================
Schema-based validation for incoming JSON payloads.
Uses jsonschema to validate structure before any processing occurs.
"""
from __future__ import annotations

from typing import Any

import jsonschema
from flask import request
from jsonschema import ValidationError


# ── Schemas ───────────────────────────────────────────────────────────────────

_SIM_FORM_SCHEMA = {
    "type": "object",
    "required": ["simName"],
    "properties": {
        "simName":    {"type": "string", "minLength": 1, "maxLength": 128},
        "mach":       {"type": ["string", "number"]},
        "aoa":        {"type": ["string", "number"]},
        "reynolds":   {"type": ["string", "number"]},
        "continuationRun":  {"type": "boolean"},
        "excrescence":      {"type": "boolean"},
        "autoRunner":       {"type": "boolean"},
        "autoMode":         {"type": "string", "enum": ["aoa", "mach"]},
        "continuationDumpData": {
            "type": "object",
            "properties": {
                "configKey": {"type": "string", "enum": ["wingConfig", "tailConfig"]},
                "flowKey":   {"type": "string"},
                "files":     {"type": "object"},
            },
        },
    },
    "additionalProperties": True,
}

_VFP_DATA_SCHEMA = {
    "type": "object",
    "required": ["formData", "inputFiles"],
    "properties": {
        "formData":   _SIM_FORM_SCHEMA,
        "inputFiles": {"type": "object"},
    },
}

_VFP_RESULT_FILES_SCHEMA = {
    "type": "object",
    "required": ["uploadId", "vfpFileName", "flowFile"],
    "properties": {
        "uploadId":    {"type": "string", "minLength": 1},
        "vfpFileName": {"type": "string", "minLength": 1},
        "flowFile":    {"type": "string", "minLength": 1},
        "flowKey":     {"type": "string"},
        "flowPath":    {"type": "string"},
    },
}

_INTERPOLATE_SCHEMA = {
    "type": "object",
    "required": ["geoData", "parameter", "startSection", "endSection"],
    "properties": {
        "geoData":      {"type": "array",  "minItems": 1},
        "plotData":     {"type": "array"},
        "parameter":    {"type": "string", "enum": ["Twist", "Dihedral", "XLE"]},
        "startSection": {"type": "integer", "minimum": 0},
        "endSection":   {"type": "integer", "minimum": 0},
        "method":       {
            "type": "string",
            "enum": ["linear", "quadratic", "elliptical", "cosine",
                     "power", "schuemann", "hermite", "exponential"],
        },
        "aValue":     {"type": "number"},
        "n":          {"type": "number"},
        "kinkEta":    {"type": "number", "minimum": 0, "maximum": 1},
        "kinkValue":  {"type": ["number", "null"]},
        "slopeStart": {"type": "number"},
        "slopeEnd":   {"type": "number"},
        "decay":      {"type": "number"},
    },
    "additionalProperties": False,
}

_PROWIM_SCHEMA = {
    "type": "object",
    "required": ["A", "bOverD", "cOverD", "N", "NSPSW", "ZPD", "CTIP",
                 "NELMNT", "alpha0", "IW", "CL0", "CD0", "KS00", "ALFAWI"],
    "properties": {
        "A":           {"type": "number"},
        "bOverD":      {"type": "number"},
        "cOverD":      {"type": "number"},
        "N":           {"type": "number"},
        "NSPSW":       {"type": "number"},
        "ZPD":         {"type": "number"},
        "CTIP":        {"type": "number"},
        "NELMNT":      {"type": "number"},
        "alpha0":      {"type": "number"},
        "IW":          {"type": "number"},
        "CL0":         {"type": "array", "items": {"type": "number"}},
        "CD0":         {"type": "array", "items": {"type": "number"}},
        "KS00":        {"type": "array", "items": {"type": "number"}},
        "ALFAWI":      {"type": "array", "items": {"type": "number"}},
        # Optional fields sent by the frontend (not used in computation)
        "D":           {"type": "number"},
        "NAW":         {"type": "number"},
        "TS00":        {"type": "array", "items": {"type": "number"}},
        "propLocation":{"type": "number"},
    },
}

_CONTOUR_GRID_SCHEMA = {
    "type": "object",
    "required": ["cp_data", "level", "contour_type", "surface_type"],
    "properties": {
        "cp_data":      {"type": "object"},
        "level":        {"type": "string"},
        "contour_type": {"type": "string"},
        "surface_type": {"type": "string", "enum": ["upper", "lower"]},
        "threshold":    {"type": "number"},
        "n_grid":       {"type": "integer", "minimum": 10, "maximum": 500},
    },
}


# ── Validator factory ─────────────────────────────────────────────────────────

def validate(data: Any, schema: dict) -> None:
    """Validate *data* against *schema*.

    Raises
    ------
    jsonschema.ValidationError
        With a human-readable message if validation fails.
    """
    jsonschema.validate(instance=data, schema=schema)


def validate_json(schema: dict):
    """Decorator: parse request JSON and validate it against *schema*.

    The validated payload is injected as the first positional argument of the
    decorated view function.

    Usage::

        @app.route("/api/example", methods=["POST"])
        @validate_json(_MY_SCHEMA)
        def my_view(data):
            ...
    """
    from functools import wraps
    from flask import jsonify

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            payload = request.get_json(silent=True)
            if payload is None:
                return jsonify(error="Request body must be valid JSON"), 400
            try:
                validate(payload, schema)
            except ValidationError as exc:
                return jsonify(error="Validation error", detail=exc.message), 422
            return fn(payload, *args, **kwargs)

        return wrapper

    return decorator


# Public aliases so blueprints can import them directly
VFP_DATA_SCHEMA          = _VFP_DATA_SCHEMA
VFP_RESULT_FILES_SCHEMA  = _VFP_RESULT_FILES_SCHEMA
INTERPOLATE_SCHEMA       = _INTERPOLATE_SCHEMA
PROWIM_SCHEMA            = _PROWIM_SCHEMA
CONTOUR_GRID_SCHEMA      = _CONTOUR_GRID_SCHEMA
