"""Tests for bridge API endpoints using FastAPI TestClient."""

import pytest
from fastapi.testclient import TestClient

from journal_bridge.main import app

AUTH = {"Authorization": "Bearer bridge-dev-key-change-in-production"}
BAD_AUTH = {"Authorization": "Bearer wrong-key"}


@pytest.fixture
def client():
    return TestClient(app)


class TestHealth:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestAuth:
    def test_parse_no_auth(self, client):
        resp = client.post("/bridge/parse", json={"raw_text": "BUY 100 AAPL @ 185", "platform": "test", "provider_msg_id": "auth-1"})
        assert resp.status_code == 422 or resp.status_code == 401

    def test_parse_bad_auth(self, client):
        resp = client.post("/bridge/parse", json={"raw_text": "BUY 100 AAPL @ 185", "platform": "test", "provider_msg_id": "auth-2"}, headers=BAD_AUTH)
        assert resp.status_code == 401

    def test_analytics_bad_endpoint(self, client):
        resp = client.get("/bridge/analytics?endpoint=../../admin", headers=AUTH)
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Invalid analytics endpoint"

    def test_analytics_valid_endpoint(self, client):
        # This will fail with 502 if TradeTally is not running, which is expected in tests
        resp = client.get("/bridge/analytics?endpoint=overview", headers=AUTH)
        assert resp.status_code in (200, 502)
