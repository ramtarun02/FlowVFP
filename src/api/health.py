"""Health & diagnostics blueprint."""
from __future__ import annotations

import platform
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health_check():
    """Lightweight liveness probe for load-balancers and Azure App Service."""
    cfg = current_app.config
    return jsonify(
        status="healthy",
        timestamp=datetime.now(timezone.utc).isoformat(),
        environment=(
            "Azure App Service"
            if __import__("os").environ.get("WEBSITE_SITE_NAME")
            else "development"
        ),
        platform=platform.platform(),
        python_version=platform.python_version(),
        directories={
            "uploads_ok":     cfg["UPLOAD_FOLDER"].exists(),
            "simulations_ok": cfg["SIMULATIONS_FOLDER"].exists(),
            "tools_ok":       cfg["TOOLS_FOLDER"].exists(),
            "logs_ok":        cfg["LOGS_FOLDER"].exists(),
            "temp_ok":        cfg["TEMP_FOLDER"].exists(),
        },
    )


@health_bp.get("/ping")
def ping():
    """Ultra-light ping endpoint (used by keep-alive monitors)."""
    return jsonify(pong=True)
