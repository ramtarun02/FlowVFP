"""
pytest configuration and shared fixtures.
"""
from __future__ import annotations

import pytest

from src.factory import create_app
from src.config import TestingConfig


@pytest.fixture(scope="session")
def app():
    """Create application with TestingConfig for the entire test session."""
    application = create_app(config_override=TestingConfig)
    application.config["TESTING"] = True

    # Ensure test directories exist
    for key in ("UPLOAD_FOLDER", "SIMULATIONS_FOLDER", "TEMP_FOLDER", "LOGS_FOLDER"):
        application.config[key].mkdir(parents=True, exist_ok=True)

    yield application

    # Cleanup (optional — remove test dirs)
    import shutil
    test_root = application.config["UPLOAD_FOLDER"].parent.parent
    if test_root.exists() and "vfp_test" in str(test_root):
        shutil.rmtree(test_root, ignore_errors=True)


@pytest.fixture(scope="session")
def client(app):
    """A test client for the application."""
    return app.test_client()


@pytest.fixture(scope="session")
def runner(app):
    """A test CLI runner."""
    return app.test_cli_runner()
