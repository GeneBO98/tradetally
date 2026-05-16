"""Integration tests for the service layer with mocked DB and TradeTally."""

from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from journal_bridge.models import ParseRequest
from journal_bridge.service import handle_confirm, handle_correct, handle_parse


# ── Helpers ──


def _mock_pool():
    """Create a mock connection pool that returns a mock connection."""
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)

    pool = MagicMock()
    pool.connection.return_value = conn

    return pool, conn


def _mock_conn_execute(conn, responses: dict[str, list]):
    """Configure conn.execute to return different results based on SQL snippets.

    responses: dict mapping SQL substring -> list of row dicts to return.
    """
    def execute_side_effect(sql, params=None):
        result = MagicMock()
        for snippet, rows in responses.items():
            if snippet in sql:
                result.fetchone.return_value = rows[0] if rows else None
                result.fetchall.return_value = rows
                return result
        result.fetchone.return_value = None
        result.fetchall.return_value = []
        return result

    conn.execute.side_effect = execute_side_effect


# ── Tests: handle_parse ──


class TestHandleParse:
    @pytest.mark.asyncio
    async def test_parse_new_stock_message(self):
        pool, conn = _mock_pool()

        _mock_conn_execute(conn, {
            "SELECT id FROM journal_ext.inbound_message": [],  # no existing message
        })

        with patch("journal_bridge.service.get_pool", return_value=pool):
            req = ParseRequest(
                raw_text="BUY 100 AAPL @ 185.50 SL 183 TP 190",
                platform="telegram",
                provider_msg_id="test-svc-1",
            )
            result = await handle_parse(req)

        assert result.intent_type == "open"
        assert result.confidence == 0.9
        assert len(result.upstream_actions) == 1
        assert result.upstream_actions[0].action == "create"
        assert "AAPL" in result.preview
        # Verify DB inserts were called
        assert conn.execute.call_count >= 2  # inbound_message + parse_attempt
        assert conn.commit.called

    @pytest.mark.asyncio
    async def test_parse_dedup_returns_existing(self):
        pool, conn = _mock_pool()

        existing_parse = {
            "id": str(uuid.uuid4()),
            "intent_type": "open",
            "extracted_json": {
                "preview": "LONG 100 AAPL",
                "upstream_actions": [{"action": "create", "summary": "BUY", "trade_data": {}}],
            },
            "confidence": 0.9,
            "validation_errors": [],
        }

        _mock_conn_execute(conn, {
            "SELECT id FROM journal_ext.inbound_message": [{"id": uuid.uuid4()}],
            "SELECT id, intent_type": [existing_parse],
        })

        with patch("journal_bridge.service.get_pool", return_value=pool):
            req = ParseRequest(
                raw_text="BUY 100 AAPL @ 185.50",
                platform="telegram",
                provider_msg_id="test-svc-dup",
            )
            result = await handle_parse(req)

        assert result.parse_id == existing_parse["id"]
        assert result.intent_type == "open"
        # No new inserts — dedup hit
        insert_calls = [c for c in conn.execute.call_args_list if "INSERT" in str(c)]
        assert len(insert_calls) == 0

    @pytest.mark.asyncio
    async def test_parse_unknown_format(self):
        pool, conn = _mock_pool()

        _mock_conn_execute(conn, {
            "SELECT id FROM journal_ext.inbound_message": [],
        })

        with patch("journal_bridge.service.get_pool", return_value=pool):
            req = ParseRequest(
                raw_text="this is not a trade",
                platform="telegram",
                provider_msg_id="test-svc-unknown",
            )
            result = await handle_parse(req)

        assert result.intent_type == "unknown"
        assert result.confidence == 0.0
        assert len(result.validation_errors) > 0


# ── Tests: handle_confirm ──


class TestHandleConfirm:
    @pytest.mark.asyncio
    async def test_confirm_creates_trade(self):
        pool, conn = _mock_pool()
        parse_id = str(uuid.uuid4())
        msg_id = str(uuid.uuid4())

        trade_data = {
            "symbol": "AAPL", "side": "long", "quantity": 100,
            "entryPrice": 185.50, "entryTime": "2026-04-10T10:00:00Z",
            "instrumentType": "stock",
        }

        _mock_conn_execute(conn, {
            "SELECT id, message_id": [{
                "id": parse_id,
                "message_id": msg_id,
                "intent_type": "open",
                "extracted_json": {
                    "upstream_actions": [{"action": "create", "summary": "BUY 100 AAPL", "trade_data": trade_data}],
                },
                "disposition": "pending",
            }],
            "SELECT tradetally_id FROM journal_ext.upstream_write": [],  # no dedup hit
        })

        mock_tt = AsyncMock()
        mock_tt.create_trade.return_value = {"id": "tt-trade-123"}

        with patch("journal_bridge.service.get_pool", return_value=pool), \
             patch("journal_bridge.service.get_tt_client", return_value=mock_tt):
            result = await handle_confirm(parse_id)

        assert result.success is True
        assert len(result.results) == 1
        assert result.results[0].status == 201
        assert result.results[0].tradetally_id == "tt-trade-123"
        mock_tt.create_trade.assert_called_once()

    @pytest.mark.asyncio
    async def test_confirm_not_found(self):
        pool, conn = _mock_pool()

        _mock_conn_execute(conn, {
            "SELECT id, message_id": [],  # not found
        })

        with patch("journal_bridge.service.get_pool", return_value=pool):
            result = await handle_confirm("nonexistent-id")

        assert result.success is False
        assert result.results[0].status == 404

    @pytest.mark.asyncio
    async def test_confirm_already_accepted(self):
        pool, conn = _mock_pool()

        _mock_conn_execute(conn, {
            "SELECT id, message_id": [{
                "id": "x", "message_id": "y", "intent_type": "open",
                "extracted_json": {"upstream_actions": []},
                "disposition": "accepted",
            }],
        })

        with patch("journal_bridge.service.get_pool", return_value=pool):
            result = await handle_confirm("x")

        assert result.success is False
        assert result.results[0].status == 409

    @pytest.mark.asyncio
    async def test_confirm_idempotency_dedup(self):
        pool, conn = _mock_pool()
        parse_id = str(uuid.uuid4())

        _mock_conn_execute(conn, {
            "SELECT id, message_id": [{
                "id": parse_id, "message_id": str(uuid.uuid4()),
                "intent_type": "open",
                "extracted_json": {
                    "upstream_actions": [{"action": "create", "summary": "test", "trade_data": {}}],
                },
                "disposition": "pending",
            }],
            "SELECT tradetally_id FROM journal_ext.upstream_write": [{"tradetally_id": "tt-existing"}],
        })

        mock_tt = AsyncMock()

        with patch("journal_bridge.service.get_pool", return_value=pool), \
             patch("journal_bridge.service.get_tt_client", return_value=mock_tt):
            result = await handle_confirm(parse_id)

        assert result.success is True
        assert result.results[0].summary == "Already written (idempotent)"
        mock_tt.create_trade.assert_not_called()

    @pytest.mark.asyncio
    async def test_confirm_query_action_skips_write(self):
        pool, conn = _mock_pool()
        parse_id = str(uuid.uuid4())

        _mock_conn_execute(conn, {
            "SELECT id, message_id": [{
                "id": parse_id, "message_id": str(uuid.uuid4()),
                "intent_type": "query",
                "extracted_json": {
                    "upstream_actions": [{"action": "query", "summary": "Show positions", "trade_data": {"endpoint": "open-positions"}}],
                },
                "disposition": "pending",
            }],
        })

        mock_tt = AsyncMock()

        with patch("journal_bridge.service.get_pool", return_value=pool), \
             patch("journal_bridge.service.get_tt_client", return_value=mock_tt):
            result = await handle_confirm(parse_id)

        assert result.success is True
        assert result.results[0].action == "query"
        mock_tt.create_trade.assert_not_called()


# ── Tests: handle_correct ──


class TestHandleCorrect:
    @pytest.mark.asyncio
    async def test_correct_updates_trade(self):
        pool, conn = _mock_pool()
        parse_id = str(uuid.uuid4())

        _mock_conn_execute(conn, {
            "SELECT id, disposition": [{"id": parse_id, "disposition": "accepted"}],
            "SELECT id, tradetally_id, action": [
                {"id": str(uuid.uuid4()), "tradetally_id": "tt-123", "action": "create"},
            ],
        })

        mock_tt = AsyncMock()
        mock_tt.update_trade.return_value = {}

        with patch("journal_bridge.service.get_pool", return_value=pool), \
             patch("journal_bridge.service.get_tt_client", return_value=mock_tt):
            result = await handle_correct(parse_id, {"entry_price": "185.25"})

        assert result["success"] is True
        mock_tt.update_trade.assert_called_once()
        call_args = mock_tt.update_trade.call_args
        assert call_args[0][0] == "tt-123"
        assert call_args[0][1]["entryPrice"] == 185.25

    @pytest.mark.asyncio
    async def test_correct_not_found(self):
        pool, conn = _mock_pool()

        _mock_conn_execute(conn, {
            "SELECT id, disposition": [],
        })

        with patch("journal_bridge.service.get_pool", return_value=pool):
            result = await handle_correct("nonexistent", {"price": "100"})

        assert result["success"] is False
        assert "not found" in result["error"]

    @pytest.mark.asyncio
    async def test_correct_not_accepted(self):
        pool, conn = _mock_pool()

        _mock_conn_execute(conn, {
            "SELECT id, disposition": [{"id": "x", "disposition": "pending"}],
        })

        with patch("journal_bridge.service.get_pool", return_value=pool):
            result = await handle_correct("x", {"price": "100"})

        assert result["success"] is False
        assert "pending" in result["error"]
