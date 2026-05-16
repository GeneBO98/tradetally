"""Core bridge service: parse, validate, write orchestration."""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone

from journal_bridge.db import get_pool
from journal_bridge.models import (
    CAMPAIGN_TYPES,
    CampaignCreate,
    CampaignDetail,
    CampaignUpdate,
    ConfirmResponse,
    ParsedTrade,
    ParseRequest,
    ParseResponse,
    UpstreamAction,
    UpstreamResult,
)
from journal_bridge.parser import parse_deterministic
from journal_bridge.tradetally_client import TradeTallyClient

log = logging.getLogger(__name__)

_tt_client: TradeTallyClient | None = None


def get_tt_client() -> TradeTallyClient:
    global _tt_client
    if _tt_client is None:
        _tt_client = TradeTallyClient()
    return _tt_client


def _make_idempotency_key(parse_id: str, action_index: int) -> str:
    """Deterministic key for upstream writes: hash(parse_id + index)."""
    raw = f"{parse_id}:{action_index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:64]


def _trade_to_tradetally_payload(trade: ParsedTrade) -> dict:
    """Convert ParsedTrade to TradeTally API request body (camelCase fields)."""
    now = datetime.now(timezone.utc).isoformat()
    payload: dict = {
        "symbol": trade.symbol,
        "side": trade.side,
        "quantity": trade.quantity,
        "instrumentType": trade.instrument_type,
    }
    if trade.entry_price is not None:
        payload["entryPrice"] = trade.entry_price
        payload["entryTime"] = now
    if trade.exit_price is not None:
        payload["exitPrice"] = trade.exit_price
        payload["exitTime"] = now
    if trade.stop_loss is not None:
        payload["stopLoss"] = trade.stop_loss
    if trade.take_profit is not None:
        payload["takeProfit"] = trade.take_profit
    if trade.strategy:
        payload["strategy"] = trade.strategy
    if trade.tags:
        payload["tags"] = trade.tags
    if trade.notes:
        payload["notes"] = trade.notes
    if trade.broker:
        payload["broker"] = trade.broker
    if trade.account_identifier:
        payload["account_identifier"] = trade.account_identifier
    # Options fields (camelCase)
    if trade.instrument_type == "option":
        if trade.strike_price is not None:
            payload["strikePrice"] = trade.strike_price
        if trade.expiration_date:
            payload["expirationDate"] = trade.expiration_date.isoformat()
        if trade.option_type:
            payload["optionType"] = trade.option_type
        payload["underlyingSymbol"] = trade.symbol
    return payload


def _is_open_trade(trade: dict) -> bool:
    """Return true only when TradeTally has no exit price/time recorded."""
    exit_price = trade.get("exit_price", trade.get("exitPrice"))
    exit_time = trade.get("exit_time", trade.get("exitTime"))
    return exit_price is None and exit_time is None


def _matches_trade_signature(candidate: dict, requested: dict) -> bool:
    """Match an open TradeTally row to the instrument described by a close action."""
    symbol = (requested.get("symbol") or "").upper()
    if symbol and (candidate.get("symbol") or "").upper() != symbol:
        return False

    requested_type = requested.get("instrumentType") or requested.get("instrument_type")
    candidate_type = candidate.get("instrument_type") or candidate.get("instrumentType")
    if requested_type and candidate_type and requested_type != candidate_type:
        return False

    requested_account = requested.get("account_identifier") or requested.get("accountIdentifier")
    candidate_account = candidate.get("account_identifier") or candidate.get("accountIdentifier")
    if requested_account and candidate_account and requested_account != candidate_account:
        return False

    if requested_type == "option":
        requested_option = requested.get("optionType") or requested.get("option_type")
        candidate_option = candidate.get("option_type") or candidate.get("optionType")
        requested_expiry = requested.get("expirationDate") or requested.get("expiration_date")
        candidate_expiry = candidate.get("expiration_date") or candidate.get("expirationDate")
        requested_strike = requested.get("strikePrice") or requested.get("strike_price")
        candidate_strike = candidate.get("strike_price") or candidate.get("strikePrice")

        if requested_option and candidate_option and requested_option != candidate_option:
            return False
        if requested_expiry and candidate_expiry and str(requested_expiry)[:10] != str(candidate_expiry)[:10]:
            return False
        if requested_strike is not None and candidate_strike is not None:
            if abs(float(requested_strike) - float(candidate_strike)) > 0.0001:
                return False

    return True


def _format_preview(intent_type: str, trade: ParsedTrade | None, actions: list[UpstreamAction]) -> str:
    """Human-readable preview for confirmation."""
    if not trade:
        return "Could not parse trade details."
    parts = []
    if intent_type == "close":
        parts.append(f"CLOSE {trade.symbol}")
        if trade.exit_price:
            parts.append(f"@ ${trade.exit_price}")
    else:
        side = trade.side.upper()
        parts.append(f"{side} {int(trade.quantity) if trade.quantity == int(trade.quantity) else trade.quantity}")
        parts.append(trade.symbol)
        if trade.instrument_type == "option" and trade.strike_price:
            opt_char = "C" if trade.option_type == "call" else "P"
            parts.append(f"{trade.strike_price}{opt_char}")
            if trade.expiration_date:
                parts.append(trade.expiration_date.strftime("%d%b%y").upper())
        if trade.entry_price:
            parts.append(f"@ ${trade.entry_price}")
        if trade.stop_loss:
            parts.append(f"SL ${trade.stop_loss}")
        if trade.take_profit:
            parts.append(f"TP ${trade.take_profit}")
    if trade.tags:
        parts.append(f"tags: {trade.tags}")
    n_writes = len(actions)
    parts.append(f"({n_writes} upstream write{'s' if n_writes != 1 else ''})")
    return " ".join(parts)


async def handle_parse(req: ParseRequest) -> ParseResponse:
    """Parse a raw message, store in journal_ext, return preview for confirmation."""
    pool = get_pool()

    with pool.connection() as conn:
        # Inbound dedup
        existing = conn.execute(
            "SELECT id FROM journal_ext.inbound_message WHERE platform = %s AND provider_msg_id = %s",
            (req.platform, req.provider_msg_id),
        ).fetchone()

        if existing:
            msg_id = str(existing["id"])
            # Return existing parse if any
            parse_row = conn.execute(
                "SELECT id, intent_type, extracted_json, confidence, validation_errors FROM journal_ext.parse_attempt WHERE message_id = %s ORDER BY created_at DESC LIMIT 1",
                (existing["id"],),
            ).fetchone()
            if parse_row:
                extracted = parse_row["extracted_json"]
                actions = extracted.get("upstream_actions", [])
                return ParseResponse(
                    parse_id=str(parse_row["id"]),
                    message_id=msg_id,
                    intent_type=parse_row["intent_type"] or "unknown",
                    preview=extracted.get("preview", ""),
                    confidence=float(parse_row["confidence"] or 0),
                    upstream_actions=[UpstreamAction(**a) for a in actions],
                    validation_errors=parse_row["validation_errors"] or [],
                )

        # Store inbound message
        msg_id_uuid = uuid.uuid4()
        conn.execute(
            """INSERT INTO journal_ext.inbound_message
               (id, platform, provider_msg_id, channel_id, sender_id, raw_text, attachment_refs)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (str(msg_id_uuid), req.platform, req.provider_msg_id, req.channel_id, req.sender_id, req.raw_text, json.dumps(req.attachment_refs) if req.attachment_refs else None),
        )
        msg_id = str(msg_id_uuid)

        # Parse
        intent_type, parsed_trade, actions, confidence = parse_deterministic(req.raw_text)
        validation_errors: list[dict] = []

        if parsed_trade is None and intent_type == "unknown":
            # LLM fallback would go here — for now return low confidence
            validation_errors.append({"field": "_", "error": "No deterministic pattern matched. LLM fallback not yet implemented."})
            confidence = 0.0

        # Populate trade_data in actions. Multi-leg/roll parses may already carry
        # per-action payloads; preserve those so close/create legs stay distinct.
        if parsed_trade:
            payload = _trade_to_tradetally_payload(parsed_trade)
            for a in actions:
                if not a.trade_data:
                    a.trade_data = payload

        preview = _format_preview(intent_type, parsed_trade, actions)

        # Store parse attempt
        parse_id_uuid = uuid.uuid4()
        extracted = {
            "preview": preview,
            "trade": parsed_trade.model_dump(mode="json") if parsed_trade else None,
            "upstream_actions": [a.model_dump(mode="json") for a in actions],
        }
        conn.execute(
            """INSERT INTO journal_ext.parse_attempt
               (id, message_id, parser_version, intent_type, extracted_json, confidence, validation_errors, disposition)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (str(parse_id_uuid), msg_id, "deterministic-v1", intent_type, json.dumps(extracted), confidence, json.dumps(validation_errors) if validation_errors else None, "pending"),
        )
        conn.commit()

    return ParseResponse(
        parse_id=str(parse_id_uuid),
        message_id=msg_id,
        intent_type=intent_type,
        preview=preview,
        confidence=confidence,
        upstream_actions=actions,
        validation_errors=validation_errors,
    )


async def handle_confirm(parse_id: str) -> ConfirmResponse:
    """Execute the writes for a confirmed parse attempt."""
    pool = get_pool()
    tt = get_tt_client()

    with pool.connection() as conn:
        # Load parse attempt with row lock to prevent concurrent confirms
        parse_row = conn.execute(
            "SELECT id, message_id, intent_type, extracted_json, disposition FROM journal_ext.parse_attempt WHERE id = %s FOR UPDATE",
            (parse_id,),
        ).fetchone()
        if not parse_row:
            return ConfirmResponse(success=False, results=[UpstreamResult(action="confirm", status=404, summary="Parse attempt not found")])
        if parse_row["disposition"] != "pending":
            return ConfirmResponse(success=False, results=[UpstreamResult(action="confirm", status=409, summary=f"Parse already {parse_row['disposition']}")])

        extracted = parse_row["extracted_json"]
        if not isinstance(extracted, dict):
            return ConfirmResponse(success=False, results=[UpstreamResult(action="confirm", status=400, summary="Invalid extracted JSON")])

        actions = extracted.get("upstream_actions", [])
        msg_id = str(parse_row["message_id"])
        valid_actions = {"create", "update", "close", "query", "correct"}

        results: list[UpstreamResult] = []
        first_campaign_id = None
        last_closed_trade: dict | None = None

        for i, action_data in enumerate(actions):
            action = action_data.get("action", "")
            if action not in valid_actions:
                results.append(UpstreamResult(action=action, status=400, summary=f"Unknown action: {action}"))
                continue

            trade_data = action_data.get("trade_data", {})
            idemp_key = _make_idempotency_key(parse_id, i)

            # Query actions don't write upstream
            if action == "query":
                results.append(UpstreamResult(action="query", status=200, summary=f"Query: {trade_data.get('query', '')}"))
                continue

            # Corrections are handled via handle_correct, not confirm
            if action == "correct":
                results.append(UpstreamResult(action="correct", status=200, summary="Use /bridge/correct endpoint"))
                continue

            # Check upstream dedup
            existing_write = conn.execute(
                "SELECT tradetally_id FROM journal_ext.upstream_write WHERE idempotency_key = %s",
                (idemp_key,),
            ).fetchone()
            if existing_write:
                results.append(UpstreamResult(
                    action=action,
                    tradetally_id=str(existing_write["tradetally_id"]) if existing_write["tradetally_id"] else None,
                    status=200,
                    summary="Already written (idempotent)",
                ))
                continue

            # Write to TradeTally
            tt_id = None
            status = 0
            summary = ""
            try:
                if action == "create":
                    if (trade_data.get("quantity") in (None, 0, 0.0)
                            and last_closed_trade
                            and (last_closed_trade.get("symbol") or "").upper() == (trade_data.get("symbol") or "").upper()
                            and (last_closed_trade.get("instrument_type") or last_closed_trade.get("instrumentType")) == (trade_data.get("instrumentType") or trade_data.get("instrument_type"))):
                        trade_data["quantity"] = last_closed_trade.get("quantity")
                    resp = await tt.create_trade(trade_data, idemp_key)
                    tt_id = resp.get("id") or resp.get("trade", {}).get("id")
                    status = 201
                    summary = f"Created trade {tt_id}"
                elif action in ("update", "close"):
                    symbol = trade_data.get("symbol", "").strip()
                    if not symbol:
                        status = 400
                        summary = "Cannot close trade: symbol is missing"
                    else:
                        open_trades = await tt.get_trades({"symbol": symbol, "limit": 5})
                        trades_list = open_trades if isinstance(open_trades, list) else open_trades.get("trades", [])
                        target = next(
                            (
                                t for t in trades_list
                                if _is_open_trade(t) and _matches_trade_signature(t, trade_data)
                            ),
                            None,
                        )
                        if target:
                            update_payload = {}
                            if trade_data.get("exitPrice"):
                                update_payload["exitPrice"] = trade_data["exitPrice"]
                                update_payload["exitTime"] = trade_data.get("exitTime", datetime.now(timezone.utc).isoformat())
                            resp = await tt.update_trade(str(target["id"]), update_payload, idemp_key)
                            tt_id = str(target["id"])
                            last_closed_trade = target
                            status = 200
                            summary = f"Closed trade {tt_id}"
                        else:
                            status = 404
                            summary = f"No open trade found for {symbol}"
            except Exception as e:
                status = 500
                summary = str(e)
                log.error("TradeTally write failed: %s", e)

            # Record upstream write
            write_id = uuid.uuid4()
            conn.execute(
                """INSERT INTO journal_ext.upstream_write
                   (id, parse_id, message_id, tradetally_id, idempotency_key, action, request_body, response_status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (str(write_id), parse_id, msg_id, tt_id, idemp_key, action, json.dumps(trade_data), status),
            )

            # Campaign auto-linking
            if status in (200, 201):
                campaign_hint = (extracted.get("trade", {}) or {}).get("campaign_hint")
                symbol = trade_data.get("symbol", "")
                if campaign_hint and symbol:
                    cid = _find_or_create_campaign(conn, symbol, campaign_hint)
                    if cid:
                        _link_to_campaign(conn, cid, str(write_id), tt_id, action, symbol)
                        if first_campaign_id is None:
                            first_campaign_id = cid

            results.append(UpstreamResult(action=action, tradetally_id=tt_id, status=status, summary=summary))

        # Mark disposition based on outcome
        all_ok = all(r.status in (200, 201) for r in results)
        disposition = "accepted" if all_ok else "error"
        conn.execute(
            "UPDATE journal_ext.parse_attempt SET disposition = %s WHERE id = %s",
            (disposition, parse_id),
        )
        conn.commit()

    return ConfirmResponse(success=all_ok, results=results, campaign_id=first_campaign_id)


async def handle_correct(parse_id: str, corrections: dict) -> dict:
    """Apply corrections to an already-written trade."""
    pool = get_pool()
    tt = get_tt_client()

    with pool.connection() as conn:
        # Load parse attempt — must be accepted (already written)
        parse_row = conn.execute(
            "SELECT id, disposition FROM journal_ext.parse_attempt WHERE id = %s",
            (parse_id,),
        ).fetchone()
        if not parse_row:
            return {"success": False, "error": "Parse attempt not found"}
        if parse_row["disposition"] != "accepted":
            return {"success": False, "error": f"Cannot correct: parse is '{parse_row['disposition']}', expected 'accepted'"}

        # Find upstream writes for this parse
        writes = conn.execute(
            "SELECT id, tradetally_id, action FROM journal_ext.upstream_write WHERE parse_id = %s ORDER BY created_at",
            (parse_id,),
        ).fetchall()
        if not writes:
            return {"success": False, "error": "No upstream writes found for this parse"}

        # Build camelCase correction payload
        field_map = {"price": "entryPrice", "entry_price": "entryPrice", "exit_price": "exitPrice",
                     "quantity": "quantity", "stop_loss": "stopLoss", "take_profit": "takeProfit",
                     "symbol": "symbol", "notes": "notes", "strategy": "strategy"}
        update_payload = {}
        for field, value in corrections.items():
            camel_field = field_map.get(field, field)
            try:
                update_payload[camel_field] = float(value)
            except (ValueError, TypeError):
                update_payload[camel_field] = value

        # Apply correction to the most recent create/update write
        results = []
        for write in writes:
            if not write["tradetally_id"]:
                continue
            tt_id = str(write["tradetally_id"])
            idemp_key = _make_idempotency_key(f"correct-{parse_id}", 0)
            try:
                await tt.update_trade(tt_id, update_payload, idemp_key)
                results.append({"tradetally_id": tt_id, "status": "corrected"})
            except Exception as e:
                log.error("Correction failed for trade %s: %s", tt_id, e)
                results.append({"tradetally_id": tt_id, "status": "failed", "error": str(e)})

        conn.commit()

    return {"success": all(r["status"] == "corrected" for r in results), "results": results}


# ── Campaign logic ──


def _find_or_create_campaign(conn, symbol: str, campaign_hint: str) -> str | None:
    """Find an open campaign matching symbol+hint, or create one if hint is a known type."""
    hint_lower = campaign_hint.lower().strip()

    # Try exact name match first
    row = conn.execute(
        "SELECT id FROM journal_ext.campaign WHERE symbol = %s AND status = 'open' AND lower(name) = %s LIMIT 1",
        (symbol, hint_lower),
    ).fetchone()
    if row:
        return str(row["id"])

    # Try campaign_type match
    if hint_lower in CAMPAIGN_TYPES:
        row = conn.execute(
            "SELECT id FROM journal_ext.campaign WHERE symbol = %s AND status = 'open' AND campaign_type = %s LIMIT 1",
            (symbol, hint_lower),
        ).fetchone()
        if row:
            return str(row["id"])

        # Auto-create
        cid = str(uuid.uuid4())
        name = f"{symbol} {hint_lower}"
        conn.execute(
            """INSERT INTO journal_ext.campaign (id, name, campaign_type, symbol, status)
               VALUES (%s, %s, %s, %s, 'open')""",
            (cid, name, hint_lower, symbol),
        )
        log.info("Auto-created campaign %s: %s %s", cid, symbol, hint_lower)
        return cid

    return None


def _link_to_campaign(conn, campaign_id: str, write_id: str, tt_id: str | None, action: str, symbol: str) -> None:
    """Insert a campaign_event and update upstream_write.campaign_id."""
    eid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO journal_ext.campaign_event
           (id, campaign_id, upstream_write_id, tradetally_id, event_type, symbol, event_time)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (eid, campaign_id, write_id, tt_id, action, symbol, datetime.now(timezone.utc).isoformat()),
    )
    conn.execute(
        "UPDATE journal_ext.upstream_write SET campaign_id = %s WHERE id = %s",
        (campaign_id, write_id),
    )


async def create_campaign(req: CampaignCreate) -> dict:
    pool = get_pool()
    cid = str(uuid.uuid4())
    name = req.name or f"{req.symbol} {req.campaign_type}"
    with pool.connection() as conn:
        conn.execute(
            """INSERT INTO journal_ext.campaign (id, name, campaign_type, symbol, thesis, meta, status)
               VALUES (%s, %s, %s, %s, %s, %s, 'open')""",
            (cid, name, req.campaign_type, req.symbol.upper(), req.thesis, json.dumps(req.meta) if req.meta else None),
        )
        conn.commit()
    return {"id": cid, "name": name, "campaign_type": req.campaign_type, "symbol": req.symbol.upper(), "status": "open"}


_CAMPAIGN_UPDATE_FIELDS = {
    "name": "name = %s",
    "status": "status = %s",
    "closed_at": "closed_at = %s",
    "thesis": "thesis = %s",
    "meta": "meta = %s",
}


async def update_campaign(campaign_id: str, req: CampaignUpdate) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute("SELECT id FROM journal_ext.campaign WHERE id = %s", (campaign_id,)).fetchone()
        if not row:
            return {"error": "Campaign not found"}
        sets, vals = [], []
        if req.name is not None:
            sets.append(_CAMPAIGN_UPDATE_FIELDS["name"]); vals.append(req.name)
        if req.status is not None:
            sets.append(_CAMPAIGN_UPDATE_FIELDS["status"]); vals.append(req.status)
            if req.status == "closed":
                sets.append(_CAMPAIGN_UPDATE_FIELDS["closed_at"]); vals.append(datetime.now(timezone.utc).isoformat())
        if req.thesis is not None:
            sets.append(_CAMPAIGN_UPDATE_FIELDS["thesis"]); vals.append(req.thesis)
        if req.meta is not None:
            sets.append(_CAMPAIGN_UPDATE_FIELDS["meta"]); vals.append(json.dumps(req.meta))
        if not sets:
            return {"error": "No fields to update"}
        vals.append(campaign_id)
        # Safe: sets list contains only values from _CAMPAIGN_UPDATE_FIELDS constant
        conn.execute(f"UPDATE journal_ext.campaign SET {', '.join(sets)} WHERE id = %s", vals)
        conn.commit()
    log.info("Updated campaign %s: %s", campaign_id, [s.split(" = ")[0] for s in sets])
    return {"id": campaign_id, "updated": True}


async def get_campaign_detail(campaign_id: str) -> CampaignDetail | None:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute("SELECT * FROM journal_ext.campaign WHERE id = %s", (campaign_id,)).fetchone()
        if not row:
            return None
        events = conn.execute(
            """SELECT ce.event_type, ce.symbol, ce.event_time, ce.tradetally_id,
                      uw.action, uw.response_status
               FROM journal_ext.campaign_event ce
               LEFT JOIN journal_ext.upstream_write uw ON uw.id = ce.upstream_write_id
               WHERE ce.campaign_id = %s ORDER BY ce.event_time""",
            (campaign_id,),
        ).fetchall()
    return CampaignDetail(
        id=str(row["id"]),
        name=row.get("name"),
        campaign_type=row.get("campaign_type"),
        symbol=row.get("symbol"),
        status=row["status"],
        thesis=row.get("thesis"),
        opened_at=str(row["opened_at"]) if row.get("opened_at") else None,
        closed_at=str(row["closed_at"]) if row.get("closed_at") else None,
        total_pnl=float(row["total_pnl"]) if row.get("total_pnl") else None,
        trade_count=len(events),
        events=[dict(e) for e in events],
    )


async def get_campaign_pnl(campaign_id: str) -> dict:
    """Calculate campaign P&L by querying TradeTally for linked trades."""
    pool = get_pool()
    tt = get_tt_client()

    with pool.connection() as conn:
        writes = conn.execute(
            """SELECT uw.tradetally_id, uw.action
               FROM journal_ext.campaign_event ce
               JOIN journal_ext.upstream_write uw ON uw.id = ce.upstream_write_id
               WHERE ce.campaign_id = %s AND uw.tradetally_id IS NOT NULL""",
            (campaign_id,),
        ).fetchall()

    if not writes:
        return {"campaign_id": campaign_id, "total_pnl": 0.0, "trade_count": 0, "details": []}

    # Fetch all trades once and build lookup
    try:
        all_trades_resp = await tt.get_trades({"limit": 500})
        all_trades = all_trades_resp if isinstance(all_trades_resp, list) else all_trades_resp.get("trades", [])
    except Exception as e:
        log.error("Failed to fetch trades for campaign P&L: %s", e)
        return {"campaign_id": campaign_id, "error": str(e), "total_pnl": 0.0, "trade_count": 0, "details": []}

    trade_lookup = {str(t.get("id")): t for t in all_trades}

    total_pnl = 0.0
    details = []
    for w in writes:
        trade = trade_lookup.get(str(w["tradetally_id"]))
        if trade and trade.get("pnl") is not None:
            pnl = float(trade["pnl"])
            total_pnl += pnl
            details.append({"tradetally_id": str(w["tradetally_id"]), "pnl": pnl, "symbol": trade.get("symbol")})

    # Update campaign total_pnl
    with pool.connection() as conn:
        conn.execute("UPDATE journal_ext.campaign SET total_pnl = %s WHERE id = %s", (total_pnl, campaign_id))
        conn.commit()

    return {"campaign_id": campaign_id, "total_pnl": total_pnl, "trade_count": len(details), "details": details}


# ── Reports ──


async def report_campaign_summary(campaign_type: str | None = None) -> list[dict]:
    pool = get_pool()
    with pool.connection() as conn:
        sql = "SELECT * FROM journal_ext.v_campaign_summary"
        params = []
        if campaign_type:
            sql += " WHERE campaign_type = %s"
            params.append(campaign_type)
        sql += " ORDER BY opened_at DESC LIMIT 100"
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


async def report_parse_accuracy() -> list[dict]:
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute("SELECT * FROM journal_ext.v_parse_accuracy").fetchall()
    return [dict(r) for r in rows]


async def report_option_income() -> list[dict]:
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute("SELECT * FROM journal_ext.v_option_income").fetchall()
    return [dict(r) for r in rows]


async def report_weekly_review() -> dict:
    """Last 7 days: win rate, P&L, trade count, top trades from TradeTally."""
    tt = get_tt_client()
    try:
        overview = await tt.get_analytics("overview")
        calendar = await tt.get_analytics("calendar")
        symbols = await tt.get_analytics("symbols")
    except Exception as e:
        log.error("Failed to fetch analytics for weekly review: %s", e)
        return {"error": str(e)}

    # Get parse accuracy from journal_ext
    pool = get_pool()
    with pool.connection() as conn:
        parse_stats = conn.execute(
            """SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE disposition = 'accepted') as accepted,
                      ROUND(AVG(confidence)::numeric, 2) as avg_confidence
               FROM journal_ext.parse_attempt
               WHERE created_at >= NOW() - interval '7 days'"""
        ).fetchone()

    return {
        "period": "last_7_days",
        "analytics": overview,
        "calendar": calendar,
        "top_symbols": symbols,
        "parse_stats": dict(parse_stats) if parse_stats else {},
    }


# ── Reconciliation ──


async def reconcile_imports() -> dict:
    """Match manual upstream_write entries to broker-imported TradeTally trades."""
    pool = get_pool()
    tt = get_tt_client()

    # Get all trades from TradeTally (including imports)
    try:
        all_trades_resp = await tt.get_trades({"limit": 500})
        all_trades = all_trades_resp if isinstance(all_trades_resp, list) else all_trades_resp.get("trades", [])
    except Exception as e:
        return {"error": f"Failed to fetch trades: {e}", "matched": 0}

    imported = [t for t in all_trades if t.get("import_id")]
    if not imported:
        return {"matched": 0, "message": "No imported trades found"}

    matched = 0
    with pool.connection() as conn:
        # Get all manual writes that don't have reconciliation records yet
        manual_writes = conn.execute(
            """SELECT uw.id, uw.tradetally_id, uw.request_body
               FROM journal_ext.upstream_write uw
               LEFT JOIN journal_ext.reconciliation_record rr ON rr.manual_write_id = uw.id
               WHERE uw.action = 'create' AND uw.response_status = 201 AND rr.id IS NULL"""
        ).fetchall()

        RECON_QTY_TOLERANCE = 0.01
        RECON_PRICE_TOLERANCE = 0.02

        for mw in manual_writes:
            req = mw["request_body"] or {}
            m_symbol = req.get("symbol", "")
            m_qty = float(req.get("quantity", 0))
            m_price = float(req.get("entryPrice", 0))

            for imp in imported:
                # Already reconciled?
                existing = conn.execute(
                    "SELECT id FROM journal_ext.reconciliation_record WHERE broker_trade_id = %s",
                    (str(imp["id"]),),
                ).fetchone()
                if existing:
                    continue

                i_symbol = imp.get("symbol", "")
                i_qty = float(imp.get("quantity", 0))
                i_price = float(imp.get("entry_price", 0))

                if (m_symbol == i_symbol
                        and abs(m_qty - i_qty) < RECON_QTY_TOLERANCE
                        and abs(m_price - i_price) < RECON_PRICE_TOLERANCE):
                    # Match found
                    rid = str(uuid.uuid4())
                    score = 1.0 if m_price == i_price else 0.9
                    conn.execute(
                        """INSERT INTO journal_ext.reconciliation_record
                           (id, manual_write_id, broker_trade_id, match_method, match_score)
                           VALUES (%s, %s, %s, %s, %s)""",
                        (rid, str(mw["id"]), str(imp["id"]), "exact" if score == 1.0 else "fuzzy", score),
                    )
                    matched += 1
                    break

        conn.commit()

    return {"matched": matched, "manual_writes_checked": len(manual_writes), "imported_trades": len(imported)}


# ── Market-helper cross-referencing ──


async def cross_reference_trade(tradetally_id: str) -> dict:
    """Look up the composite signal score at the time a trade was entered."""
    from journal_bridge.config import settings as cfg

    if not cfg.market_helper_database_url:
        return {"error": "Market-helper cross-referencing not configured (MARKET_HELPER_DATABASE_URL empty)"}

    # Get trade details from TradeTally
    tt = get_tt_client()
    try:
        all_trades_resp = await tt.get_trades({"limit": 200})
        all_trades = all_trades_resp if isinstance(all_trades_resp, list) else all_trades_resp.get("trades", [])
        trade = next((t for t in all_trades if str(t.get("id")) == tradetally_id), None)
    except Exception as e:
        return {"error": f"Failed to fetch trade: {e}"}

    if not trade:
        return {"error": f"Trade {tradetally_id} not found"}

    symbol = trade.get("symbol", "")
    entry_time = trade.get("entry_time")
    if not entry_time:
        return {"error": "Trade has no entry_time", "trade": {"symbol": symbol}}

    # Query market-helper for nearest composite snapshot
    import psycopg
    from psycopg.rows import dict_row

    try:
        with psycopg.connect(cfg.market_helper_database_url, row_factory=dict_row) as mh_conn:
            snapshot = mh_conn.execute(
                """SELECT composite_score, direction, signal_count, thesis, score_breakdown, observed_at
                   FROM composite_snapshots
                   WHERE symbol = %s
                     AND observed_at <= %s
                     AND observed_at >= %s::timestamptz - interval '30 minutes'
                   ORDER BY observed_at DESC
                   LIMIT 1""",
                (symbol, entry_time, entry_time),
            ).fetchone()
    except Exception as e:
        return {"error": f"Failed to query market-helper: {e}", "trade": {"symbol": symbol, "entry_time": entry_time}}

    if not snapshot:
        return {
            "trade": {"symbol": symbol, "entry_time": entry_time, "side": trade.get("side")},
            "signal_at_entry": None,
            "message": f"No composite snapshot found for {symbol} within 30min of entry",
        }

    trade_direction = "bullish" if trade.get("side") == "long" else "bearish"
    signal_direction = snapshot["direction"]
    aligned = trade_direction == signal_direction

    return {
        "trade": {"symbol": symbol, "entry_time": entry_time, "side": trade.get("side")},
        "signal_at_entry": {
            "composite_score": float(snapshot["composite_score"]),
            "direction": signal_direction,
            "signal_count": snapshot["signal_count"],
            "aligned": aligned,
            "thesis": snapshot.get("thesis"),
            "observed_at": str(snapshot["observed_at"]),
            "score_breakdown": snapshot.get("score_breakdown"),
        },
    }
