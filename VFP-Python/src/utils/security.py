"""
Security Utilities
==================
Path-traversal guards, filename sanitization, and extension validation.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from werkzeug.utils import secure_filename as _secure_filename


# ── Allowed upload extensions ─────────────────────────────────────────────────
ALLOWED_EXTENSIONS: frozenset[str] = frozenset(
    {"geo", "vfp", "dat", "map", "vis", "tail"}
)

# Maximum filename length (characters, after sanitization)
_MAX_FILENAME_LEN = 128

# Characters explicitly banned from filenames even after secure_filename()
_BANNED_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def allowed_file(filename: str, extra_extensions: frozenset[str] | None = None) -> bool:
    """Return *True* if *filename* carries an allowed file extension.

    Parameters
    ----------
    filename:
        Original (potentially unsafe) filename from the user.
    extra_extensions:
        Additional extensions to accept for this particular call.
    """
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[-1].lower()
    allowed = ALLOWED_EXTENSIONS | (extra_extensions or frozenset())
    return ext in allowed


def safe_filename(filename: str) -> str:
    """Return a sanitized filename that is safe for filesystem use.

    Raises
    ------
    ValueError
        If the sanitized result is empty or contains traversal sequences.
    """
    name = _secure_filename(filename)
    if not name:
        raise ValueError(f"Filename '{filename}' is not safe and cannot be used.")
    if len(name) > _MAX_FILENAME_LEN:
        stem, _, ext = name.rpartition(".")
        name = stem[: _MAX_FILENAME_LEN - len(ext) - 1] + "." + ext
    return name


def safe_join(base: Path, *parts: str) -> Path:
    """Join *parts* to *base* and guarantee the result stays inside *base*.

    This is a stricter version of :func:`werkzeug.security.safe_join` that
    works with :class:`pathlib.Path` objects.

    Raises
    ------
    PermissionError
        If the resolved path escapes the base directory.
    """
    base_resolved = base.resolve()
    full = base_resolved.joinpath(*parts).resolve()
    if not str(full).startswith(str(base_resolved)):
        raise PermissionError(
            f"Path traversal attempt detected: '{full}' is outside '{base_resolved}'"
        )
    return full


def validate_sim_name(name: str) -> str:
    """Validate and normalise a simulation name.

    Allowed characters: alphanumeric, dash, underscore, dot.
    Maximum length: 128 characters.

    Returns the (unchanged) name if valid.

    Raises
    ------
    ValueError
        If the name contains invalid characters or is otherwise unsafe.
    """
    if not name:
        raise ValueError("Simulation name must not be empty.")
    if len(name) > 128:
        raise ValueError("Simulation name must be ≤ 128 characters.")
    if not re.match(r"^[A-Za-z0-9_\-\.]+$", name):
        raise ValueError(
            "Simulation name may only contain letters, digits, hyphens, "
            "underscores, and dots."
        )
    # Prevent path traversal disguised as sim names
    if ".." in name or "/" in name or os.sep in name:
        raise ValueError("Simulation name must not contain path separators.")
    return name
