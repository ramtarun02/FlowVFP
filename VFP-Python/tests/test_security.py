"""
Security-focused tests
=======================
These tests verify that the application correctly blocks common attack vectors.
"""
from __future__ import annotations

import io
import json


class TestPathTraversal:
    """Path traversal should be blocked at every file-serving endpoint."""

    def test_file_content_path_traversal_blocked(self, client):
        payload = {"simName": "test", "filePath": "../../etc/passwd"}
        response = client.post(
            "/api/simulation/file-content",
            data=json.dumps(payload),
            content_type="application/json",
        )
        # Must reject with 403 (forbidden) or 422 (validation error)
        assert response.status_code in (403, 422, 404)

    def test_file_content_dotdot_slash_blocked(self, client):
        payload = {"simName": "../../../", "filePath": "secret.txt"}
        response = client.post(
            "/api/simulation/file-content",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code in (403, 422, 404)

    def test_sim_name_with_slashes_rejected(self, client):
        payload = {"simName": "/etc/passwd", "filePath": "file.txt"}
        response = client.post(
            "/api/simulation/file-content",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code in (403, 422, 400)

    def test_sim_name_with_null_bytes_rejected(self, client):
        payload = {"simName": "valid\x00evil", "filePath": "file.txt"}
        response = client.post(
            "/api/simulation/file-content",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code in (400, 422)


class TestFileUploadSecurity:
    """Upload endpoints must validate file extensions."""

    def test_geo_import_rejects_non_geo_file(self, client):
        data = {
            "files": (io.BytesIO(b"#!/bin/bash\nrm -rf /"), "evil.sh"),
        }
        response = client.post(
            "/api/geometry/import",
            data=data,
            content_type="multipart/form-data",
        )
        body = json.loads(response.data)
        # Should succeed (200) but report an error for the individual file
        if response.status_code == 200:
            results = body.get("results", [])
            assert any("error" in r for r in results)

    def test_vfp_upload_rejects_non_vfp_file(self, client):
        data = {
            "file": (io.BytesIO(b"<script>alert(1)</script>"), "xss.html"),
        }
        response = client.post(
            "/api/files/upload-vfp",
            data=data,
            content_type="multipart/form-data",
        )
        assert response.status_code in (400, 422)

    def test_vfp_upload_rejects_no_file(self, client):
        response = client.post("/api/files/upload-vfp", data={})
        assert response.status_code == 400


class TestInputValidation:
    """Malformed JSON must return 422, not 500."""

    def test_start_vfp_missing_form_data_rejected(self, client):
        payload = {"inputFiles": {}}  # missing formData
        response = client.post(
            "/api/simulation/start",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 422

    def test_start_vfp_empty_sim_name_rejected(self, client):
        payload = {
            "formData": {"simName": ""},
            "inputFiles": {},
        }
        response = client.post(
            "/api/simulation/start",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code in (422, 400)

    def test_interpolate_invalid_parameter_rejected(self, client):
        payload = {
            "geoData":      [{"TWIST": 0, "HSECT": 0, "G1SECT": 0, "G2SECT": 1}],
            "parameter":    "INVALID_PARAM",
            "startSection": 0,
            "endSection":   0,
        }
        response = client.post(
            "/api/geometry/interpolate-parameter",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 422

    def test_contour_grid_missing_required_fields_rejected(self, client):
        payload = {"cp_data": {}}   # missing level, contour_type, surface_type
        response = client.post(
            "/api/post/contour-grid",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 422

    def test_prowim_missing_required_field_rejected(self, client):
        payload = {}  # completely empty
        response = client.post(
            "/api/prowim/compute",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 422

    def test_non_json_body_returns_400(self, client):
        response = client.post(
            "/api/simulation/start",
            data="not json at all",
            content_type="text/plain",
        )
        assert response.status_code in (400, 415, 422)


class TestErrorHandlers:
    """Global error handlers must return JSON, not HTML."""

    def test_404_returns_json(self, client):
        response = client.get("/this_route_does_not_exist_xyz")
        assert response.status_code == 404
        data = json.loads(response.data)
        assert "error" in data

    def test_json_not_traceback_on_error(self, client):
        """No Python traceback should appear in the response body."""
        response = client.get("/this_route_does_not_exist_xyz")
        body = response.data.decode("utf-8")
        assert "Traceback" not in body
        assert "File \"" not in body


class TestCORS:
    """Crude CORS smoke-tests."""

    def test_health_allows_preflight(self, client):
        response = client.options(
            "/health",
            headers={
                "Origin":                         "http://localhost:3000",
                "Access-Control-Request-Method":  "GET",
            },
        )
        # 200 or 204 are acceptable
        assert response.status_code in (200, 204)
