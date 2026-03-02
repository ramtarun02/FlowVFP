"""
Security utility unit tests
============================
"""
from __future__ import annotations

import pytest
from pathlib import Path

from src.utils.security import (
    allowed_file,
    safe_filename,
    safe_join,
    validate_sim_name,
)


class TestAllowedFile:
    def test_geo_allowed(self):
        assert allowed_file("wing.GEO") is True

    def test_vfp_allowed(self):
        assert allowed_file("results.vfp") is True

    def test_upper_case_extension(self):
        assert allowed_file("WING.VFP") is True

    def test_exe_not_allowed(self):
        assert allowed_file("evil.exe") is False

    def test_py_not_allowed(self):
        assert allowed_file("hack.py") is False

    def test_no_extension_not_allowed(self):
        assert allowed_file("filename_without_ext") is False

    def test_empty_string_not_allowed(self):
        assert allowed_file("") is False

    def test_extra_extension_allowed(self):
        assert allowed_file("data.tail", frozenset({"tail"})) is True


class TestSafeFilename:
    def test_normal_filename_unchanged(self):
        result = safe_filename("wing.GEO")
        assert result == "wing.GEO"

    def test_path_traversal_stripped(self):
        result = safe_filename("../../etc/passwd")
        # werkzeug's secure_filename will strip the path components
        assert ".." not in result
        assert "/" not in result

    def test_empty_filename_raises(self):
        with pytest.raises(ValueError):
            safe_filename("")

    def test_path_only_raises(self):
        with pytest.raises(ValueError):
            safe_filename("../../../")

    def test_long_filename_truncated(self):
        long_name = "a" * 200 + ".geo"
        result = safe_filename(long_name)
        assert len(result) <= 128 + 4  # stem + ext


class TestSafeJoin:
    def test_normal_join_succeeds(self, tmp_path):
        result = safe_join(tmp_path, "subdir", "file.txt")
        assert result == tmp_path.resolve() / "subdir" / "file.txt"

    def test_traversal_raises_permission_error(self, tmp_path):
        with pytest.raises(PermissionError):
            safe_join(tmp_path, "../../etc/passwd")

    def test_double_dot_in_middle_raises(self, tmp_path):
        with pytest.raises(PermissionError):
            safe_join(tmp_path, "valid", "..", "..", "etc", "passwd")


class TestValidateSimName:
    def test_valid_alphanumeric(self):
        assert validate_sim_name("DCWing001") == "DCWing001"

    def test_valid_with_hyphens_underscores(self):
        assert validate_sim_name("DC304-Wing-v2_final") == "DC304-Wing-v2_final"

    def test_valid_with_dots(self):
        assert validate_sim_name("sim.v1.0") == "sim.v1.0"

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            validate_sim_name("")

    def test_too_long_raises(self):
        with pytest.raises(ValueError):
            validate_sim_name("a" * 129)

    def test_path_separator_raises(self):
        with pytest.raises(ValueError):
            validate_sim_name("../etc/passwd")

    def test_spaces_raise(self):
        with pytest.raises(ValueError):
            validate_sim_name("my simulation")

    def test_special_chars_raise(self):
        with pytest.raises(ValueError):
            validate_sim_name("sim<script>")

    def test_null_bytes_raise(self):
        with pytest.raises(ValueError):
            validate_sim_name("sim\x00evil")
