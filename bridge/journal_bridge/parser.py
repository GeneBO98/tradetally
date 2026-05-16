"""Deterministic trade message parser.

Handles known formats with regex. Returns None if no match (LLM fallback needed).
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

from journal_bridge.models import CAMPAIGN_TYPES, ParsedTrade, UpstreamAction


# ── Regex patterns ──

# BUY 100 AAPL @ 185.50 SL 183 TP 190
_STOCK_RE = re.compile(
    r"^(?P<action>BUY|SELL|BTO|STO|STC|BTC|SELL\s+SHORT)\s+"
    r"(?P<qty>\d+(?:\.\d+)?)\s+"
    r"(?P<symbol>[A-Z]{1,6})\s+"
    r"@\s*(?P<price>\d+(?:\.\d+)?)"
    r"(?:\s+SL\s*(?P<sl>\d+(?:\.\d+)?))?"
    r"(?:\s+TP\s*(?P<tp>\d+(?:\.\d+)?))?"
    r"(?:\s+account=(?P<account>\S+))?"
    r"(?:\s+tags=(?P<tags>\S+))?",
    re.IGNORECASE,
)

# BTO 2 AAPL 17APR26 190C @ 2.15 account=IBKR tags=earnings,swing
_OPTION_RE = re.compile(
    r"^(?P<action>BTO|STO|STC|BTC|BUY|SELL)\s+"
    r"(?P<qty>\d+)\s+"
    r"(?P<symbol>[A-Z]{1,6})\s+"
    r"(?P<expiry>\d{1,2}[A-Z]{3}\d{2,4})\s+"
    r"(?P<strike>\d+(?:\.\d+)?)(?P<opttype>[CP])\s+"
    r"@\s*(?P<price>\d+(?:\.\d+)?)"
    r"(?:\s+account=(?P<account>\S+))?"
    r"(?:\s+tags=(?P<tags>\S+))?",
    re.IGNORECASE,
)

# Closed AAPL long +$350  |  Closed AAPL @ 190  |  Stopped out TSLA @ 172
_EXIT_RE = re.compile(
    r"^(?:closed|exited|stopped\s+out|sold)\s+"
    r"(?P<symbol>[A-Z]{1,6})"
    r"(?:\s+(?:long|short))?"
    r"(?:\s+@\s*(?P<price>\d+(?:\.\d+)?))?"
    r"(?:\s+[+\-]?\$?(?P<pnl>[\d.]+))?"
    r"(?:\s+[+\-]?(?P<pnl_pct>[\d.]+)%)?",
    re.IGNORECASE,
)

# Rolled AAPL 190C 17APR26 to 195C 24APR26 for 0.55 credit/debit
_ROLL_RE = re.compile(
    r"^roll(?:ed)?\s+"
    r"(?P<symbol>[A-Z]{1,6})\s+"
    r"(?P<old_strike>\d+(?:\.\d+)?)(?P<old_type>[CP])\s+"
    r"(?P<old_expiry>\d{1,2}[A-Z]{3}\d{2,4})\s+"
    r"to\s+"
    r"(?P<new_strike>\d+(?:\.\d+)?)(?P<new_type>[CP])\s+"
    r"(?P<new_expiry>\d{1,2}[A-Z]{3}\d{2,4})"
    r"(?:\s+for\s+(?P<net_premium>\d+(?:\.\d+)?)\s*(?P<credit_debit>credit|debit))?",
    re.IGNORECASE,
)

# Correct last trade, price was 2.05 not 2.15
_CORRECT_RE = re.compile(
    r"^correct\s+last\s+trade.*?(?P<field>price|quantity|qty|symbol)\s+was\s+(?P<new_val>\S+)",
    re.IGNORECASE,
)

# Query patterns
_QUERY_RE = re.compile(
    r"^(?:show|list|get|what(?:'s| is| are)?|how)\s+"
    r"(?P<query>.+)",
    re.IGNORECASE,
)

_QUERY_KEYWORDS = {
    "open positions": "open-positions",
    "open trades": "open-positions",
    "positions": "open-positions",
    "weekly p&l": "analytics",
    "weekly pnl": "analytics",
    "monthly p&l": "analytics",
    "monthly pnl": "analytics",
    "p&l": "analytics",
    "pnl": "analytics",
    "performance": "analytics",
    "win rate": "analytics",
    "winrate": "analytics",
    "overview": "analytics",
    "campaigns": "campaigns",
    "open campaigns": "campaigns",
    "wheel campaigns": "campaigns",
}


def _parse_expiry(s: str) -> date | None:
    """Parse '17APR26' or '17APR2026' into a date."""
    s = s.upper()
    for fmt in ("%d%b%y", "%d%b%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


_CAMPAIGN_RE = re.compile(r"campaign=(\S+)", re.IGNORECASE)


def _extract_campaign_hint(raw_text: str) -> str | None:
    """Extract campaign hint from raw text. Supports campaign=wheel or trailing known type."""
    m = _CAMPAIGN_RE.search(raw_text)
    if m:
        return m.group(1).lower()
    # Check if any known campaign type appears as a standalone word at end of text
    words = raw_text.lower().split()
    for w in reversed(words[-3:]):  # check last 3 words
        cleaned = w.strip(",.;:")
        if cleaned in CAMPAIGN_TYPES:
            return cleaned
    return None


def _infer_side(action: str) -> str:
    action = action.upper().strip()
    if action in ("BUY", "BTO"):
        return "long"
    if action in ("SELL", "STO", "SELL SHORT"):
        return "short"
    return "long"


def _is_opening(action: str) -> bool:
    return action.upper().strip() in ("BUY", "BTO", "STO", "SELL SHORT")


def parse_deterministic(raw_text: str) -> tuple[str, ParsedTrade | None, list[UpstreamAction], float]:
    """Try deterministic parsing.

    Returns (intent_type, parsed_trade, upstream_actions, confidence).
    Returns intent_type='unknown' and parsed_trade=None if no pattern matches.
    """
    text = raw_text.strip()
    campaign_hint = _extract_campaign_hint(text)

    def _with_hint(intent, trade, actions, conf):
        """Attach campaign_hint to parsed trade if present."""
        if trade is not None and campaign_hint:
            trade.campaign_hint = campaign_hint
        return intent, trade, actions, conf

    # ── Correction ──
    m = _CORRECT_RE.match(text)
    if m:
        field = m.group("field").lower()
        if field == "qty":
            field = "quantity"
        new_val = m.group("new_val")
        actions = [UpstreamAction(
            action="correct",
            summary=f"Correct {field} to {new_val}",
            trade_data={"corrections": {field: new_val}},
        )]
        return _with_hint("correct", None, actions, 0.7)

    # ── Query ──
    m = _QUERY_RE.match(text)
    if m:
        query_text = m.group("query").lower().strip()
        endpoint = None
        for keyword, ep in _QUERY_KEYWORDS.items():
            if keyword in query_text:
                endpoint = ep
                break
        if endpoint:
            actions = [UpstreamAction(
                action="query",
                summary=f"Query: {query_text}",
                trade_data={"endpoint": endpoint, "query": query_text},
            )]
            return _with_hint("query", None, actions, 0.8)

    # ── Roll ──
    m = _ROLL_RE.match(text)
    if m:
        symbol = m.group("symbol").upper()
        old_type = "call" if m.group("old_type").upper() == "C" else "put"
        new_type = "call" if m.group("new_type").upper() == "C" else "put"
        old_strike = float(m.group("old_strike"))
        new_strike = float(m.group("new_strike"))
        old_expiry = _parse_expiry(m.group("old_expiry"))
        new_expiry = _parse_expiry(m.group("new_expiry"))
        net_premium = float(m.group("net_premium")) if m.group("net_premium") else None
        is_credit = m.group("credit_debit") and m.group("credit_debit").lower() == "credit"

        old_char = m.group("old_type").upper()
        new_char = m.group("new_type").upper()

        close_trade = ParsedTrade(
            symbol=symbol,
            side="long",
            quantity=0,
            instrument_type="option",
            strike_price=old_strike,
            expiration_date=old_expiry,
            option_type=old_type,
        )
        open_trade = ParsedTrade(
            symbol=symbol,
            side="short" if old_type == new_type else "long",
            quantity=0,
            instrument_type="option",
            strike_price=new_strike,
            expiration_date=new_expiry,
            option_type=new_type,
            entry_price=net_premium,
        )

        actions = [
            UpstreamAction(
                action="close",
                summary=f"CLOSE {symbol} {old_strike}{old_char} {m.group('old_expiry')}",
                trade_data={
                    "symbol": symbol,
                    "side": close_trade.side,
                    "quantity": close_trade.quantity,
                    "instrumentType": "option",
                    "strikePrice": old_strike,
                    "expirationDate": old_expiry.isoformat() if old_expiry else None,
                    "optionType": old_type,
                    "underlyingSymbol": symbol,
                },
            ),
            UpstreamAction(
                action="create",
                summary=f"OPEN {symbol} {new_strike}{new_char} {m.group('new_expiry')}"
                + (f" for {net_premium} {'credit' if is_credit else 'debit'}" if net_premium else ""),
                trade_data={
                    "symbol": symbol,
                    "side": open_trade.side,
                    "quantity": open_trade.quantity,
                    "instrumentType": "option",
                    "entryPrice": net_premium,
                    "entryTime": datetime.now(timezone.utc).isoformat() if net_premium is not None else None,
                    "strikePrice": new_strike,
                    "expirationDate": new_expiry.isoformat() if new_expiry else None,
                    "optionType": new_type,
                    "underlyingSymbol": symbol,
                },
            ),
        ]
        return _with_hint("roll", close_trade, actions, 0.85)

    # ── Exit ──
    m = _EXIT_RE.match(text)
    if m:
        trade = ParsedTrade(
            symbol=m.group("symbol").upper(),
            side="long",
            quantity=0,
            exit_price=float(m.group("price")) if m.group("price") else None,
        )
        summary = f"CLOSE {trade.symbol}"
        if trade.exit_price:
            summary += f" @ ${trade.exit_price}"
        actions = [UpstreamAction(action="close", summary=summary, trade_data={})]
        return _with_hint("close", trade, actions, 0.8)

    # ── Option ──
    m = _OPTION_RE.match(text)
    if m:
        action = m.group("action").upper()
        opt_type = "call" if m.group("opttype").upper() == "C" else "put"
        trade = ParsedTrade(
            symbol=m.group("symbol").upper(),
            side=_infer_side(action),
            quantity=float(m.group("qty")),
            entry_price=float(m.group("price")) if _is_opening(action) else None,
            exit_price=float(m.group("price")) if not _is_opening(action) else None,
            instrument_type="option",
            strike_price=float(m.group("strike")),
            expiration_date=_parse_expiry(m.group("expiry")),
            option_type=opt_type,
            broker=m.group("account"),
            tags=m.group("tags").split(",") if m.group("tags") else [],
        )
        act = "create" if _is_opening(action) else "close"
        summary = f"{action} {int(trade.quantity)} {trade.symbol} {m.group('strike')}{m.group('opttype').upper()} {m.group('expiry')} @ ${m.group('price')}"
        actions = [UpstreamAction(action=act, summary=summary, trade_data={})]
        return _with_hint("open" if act == "create" else "close", trade, actions, 0.9)

    # ── Stock ──
    m = _STOCK_RE.match(text)
    if m:
        action = m.group("action").upper()
        trade = ParsedTrade(
            symbol=m.group("symbol").upper(),
            side=_infer_side(action),
            quantity=float(m.group("qty")),
            entry_price=float(m.group("price")),
            stop_loss=float(m.group("sl")) if m.group("sl") else None,
            take_profit=float(m.group("tp")) if m.group("tp") else None,
            broker=m.group("account"),
            tags=m.group("tags").split(",") if m.group("tags") else [],
        )
        summary = f"{action} {int(trade.quantity)} {trade.symbol} @ ${trade.entry_price}"
        if trade.stop_loss:
            summary += f" SL ${trade.stop_loss}"
        if trade.take_profit:
            summary += f" TP ${trade.take_profit}"
        actions = [UpstreamAction(action="create", summary=summary, trade_data={})]
        return _with_hint("open", trade, actions, 0.9)

    return _with_hint("unknown", None, [], 0.0)
