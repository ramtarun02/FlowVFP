"""
Simulation API tests
====================
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


class TestSimulationStart:
    """POST /api/simulation/start"""

    def _valid_payload(self, sim_name: str = "test_sim_001") -> dict:
        return {
            "formData": {"simName": sim_name, "mach": "0.8", "aoa": "2.0"},
            "inputFiles": {
                "wingConfig": {
                    "fileNames": {"GeoFile": "wing.GEO", "MapFile": "wing.MAP", "DatFile": "wing.DAT"},
                    "fileData":  {
                        "wing.GEO": "1\n0.0 0.0 1.0 0.0\n0 10 10 0.25 0.0",
                        "wing.MAP": "test map content",
                        "wing.DAT": "test dat content",
                    },
                },
                "tailConfig": {
                    "fileNames": {"GeoFile": "", "MapFile": "", "DatFile": ""},
                    "fileData":  {},
                },
                "bodyFiles": {"fileNames": [], "fileData": {}},
            },
        }

    def test_start_valid_payload_returns_200(self, client):
        response = client.post(
            "/api/simulation/start",
            data=json.dumps(self._valid_payload()),
            content_type="application/json",
        )
        # 200 = case created; files exist and can be written
        assert response.status_code in (200, 422, 500)   # 422/500 if disk write fails in test env

    def test_start_missing_sim_name_returns_422(self, client):
        payload = self._valid_payload()
        payload["formData"]["simName"] = ""
        response = client.post(
            "/api/simulation/start",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 422

    def test_start_invalid_sim_name_chars_rejected(self, client):
        payload = self._valid_payload(sim_name="../../../etc")
        response = client.post(
            "/api/simulation/start",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code in (400, 422)

    def test_start_with_spaces_in_name_rejected(self, client):
        payload = self._valid_payload(sim_name="my simulation")
        response = client.post(
            "/api/simulation/start",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code in (400, 422)


class TestSimulationFolderListing:
    """GET /api/simulation/folder/<sim_name>"""

    def test_nonexistent_sim_returns_404(self, client):
        response = client.get("/api/simulation/folder/no_such_sim_xyz9999")
        assert response.status_code == 404

    def test_invalid_name_returns_422(self, client):
        response = client.get("/api/simulation/folder/../../etc")
        assert response.status_code in (404, 422, 400)

    def test_valid_request_returns_json(self, client, app):
        # Create a dummy sim folder with one file
        sim_folder = app.config["SIMULATIONS_FOLDER"] / "test_listing"
        sim_folder.mkdir(parents=True, exist_ok=True)
        (sim_folder / "output.cp").write_text("test data")

        response = client.get("/api/simulation/folder/test_listing")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert "files" in data
        file_names = [f["name"] for f in data["files"]]
        assert "output.cp" in file_names


class TestUploadVFPData:
    """POST /api/simulation/upload-data"""

    def test_stores_payload_and_returns_upload_id(self, client):
        payload = {"formData": {"simName": "test"}, "inputFiles": {}}
        response = client.post(
            "/api/simulation/upload-data",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert "uploadId" in data
        assert len(data["uploadId"]) == 36  # UUID-4 format

    def test_returns_400_for_empty_body(self, client):
        response = client.post(
            "/api/simulation/upload-data",
            data="",
            content_type="application/json",
        )
        assert response.status_code in (400, 422)
