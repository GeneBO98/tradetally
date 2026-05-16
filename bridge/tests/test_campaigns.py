"""Tests for campaign logic: CRUD, auto-linking, parser hints."""

from journal_bridge.parser import parse_deterministic


class TestCampaignHintExtraction:
    def test_campaign_equals_syntax(self):
        intent, trade, _, _ = parse_deterministic("BUY 100 AAPL @ 185.50 campaign=wheel")
        assert trade.campaign_hint == "wheel"

    def test_trailing_campaign_type(self):
        intent, trade, _, _ = parse_deterministic("STO 1 NVDA 15MAY26 120P @ 4.20 wheel")
        assert trade.campaign_hint == "wheel"

    def test_swing_hint(self):
        intent, trade, _, _ = parse_deterministic("BUY 50 TSLA @ 250 swing")
        assert trade.campaign_hint == "swing"

    def test_no_campaign_hint(self):
        intent, trade, _, _ = parse_deterministic("BUY 100 AAPL @ 185.50")
        assert trade.campaign_hint is None

    def test_campaign_hint_on_exit(self):
        intent, trade, _, _ = parse_deterministic("Closed AAPL @ 190 wheel")
        assert trade.campaign_hint == "wheel"

    def test_campaign_hint_on_roll(self):
        intent, trade, _, _ = parse_deterministic(
            "Rolled AAPL 190C 17APR26 to 195C 24APR26 for 0.55 credit"
        )
        # No campaign hint in this message
        assert trade.campaign_hint is None

    def test_covered_call_hint(self):
        intent, trade, _, _ = parse_deterministic("STO 1 AAPL 17APR26 195C @ 2.50 covered_call")
        assert trade.campaign_hint == "covered_call"

    def test_campaign_equals_custom_name(self):
        intent, trade, _, _ = parse_deterministic("BUY 100 AAPL @ 185.50 campaign=mywheel2026")
        assert trade.campaign_hint == "mywheel2026"


class TestCampaignAPI:
    """API-level tests using TestClient (require DB)."""

    def test_create_campaign(self):
        from fastapi.testclient import TestClient
        from journal_bridge.main import app

        client = TestClient(app)
        AUTH = {"Authorization": "Bearer bridge-dev-key-change-in-production"}

        resp = client.post("/bridge/campaigns", json={
            "campaign_type": "wheel",
            "symbol": "AAPL",
            "thesis": "AAPL wheel cycle Q2 2026",
        }, headers=AUTH)
        assert resp.status_code == 200
        data = resp.json()
        assert data["symbol"] == "AAPL"
        assert data["campaign_type"] == "wheel"
        assert data["status"] == "open"
        campaign_id = data["id"]

        # Get detail
        resp = client.get(f"/bridge/campaigns/{campaign_id}", headers=AUTH)
        assert resp.status_code == 200
        detail = resp.json()
        assert detail["id"] == campaign_id
        assert detail["trade_count"] == 0

        # Update
        resp = client.put(f"/bridge/campaigns/{campaign_id}", json={
            "thesis": "Updated thesis",
        }, headers=AUTH)
        assert resp.status_code == 200

        # Close
        resp = client.delete(f"/bridge/campaigns/{campaign_id}", headers=AUTH)
        assert resp.status_code == 200

        # Verify closed
        resp = client.get(f"/bridge/campaigns/{campaign_id}", headers=AUTH)
        assert resp.json()["status"] == "closed"

    def test_create_campaign_invalid_type(self):
        from fastapi.testclient import TestClient
        from journal_bridge.main import app

        client = TestClient(app)
        AUTH = {"Authorization": "Bearer bridge-dev-key-change-in-production"}
        resp = client.post("/bridge/campaigns", json={
            "campaign_type": "invalid_xyz",
            "symbol": "AAPL",
        }, headers=AUTH)
        assert resp.status_code == 422

    def test_get_nonexistent_campaign(self):
        from fastapi.testclient import TestClient
        from journal_bridge.main import app

        client = TestClient(app)
        AUTH = {"Authorization": "Bearer bridge-dev-key-change-in-production"}
        resp = client.get("/bridge/campaigns/00000000-0000-0000-0000-000000000000", headers=AUTH)
        assert resp.status_code == 404
