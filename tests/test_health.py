"""
Health endpoint tests
=====================
"""
from __future__ import annotations

import json


class TestHealth:
    def test_health_returns_200(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_returns_json(self, client):
        response = client.get("/health")
        data = json.loads(response.data)
        assert "status" in data
        assert data["status"] == "healthy"

    def test_health_includes_timestamp(self, client):
        response = client.get("/health")
        data = json.loads(response.data)
        assert "timestamp" in data

    def test_health_includes_directories(self, client):
        response = client.get("/health")
        data = json.loads(response.data)
        assert "directories" in data
        dirs = data["directories"]
        assert "uploads_ok" in dirs
        assert "simulations_ok" in dirs

    def test_ping_returns_200(self, client):
        response = client.get("/ping")
        assert response.status_code == 200

    def test_ping_returns_pong(self, client):
        response = client.get("/ping")
        data = json.loads(response.data)
        assert data.get("pong") is True
