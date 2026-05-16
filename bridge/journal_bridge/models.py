"""Request/response models for the bridge API."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ── Inbound ──


class ParseRequest(BaseModel):
    raw_text: str
    platform: str = "telegram"
    provider_msg_id: str
    channel_id: str | None = None
    sender_id: str | None = None
    attachment_refs: list[dict] | None = None


class ConfirmRequest(BaseModel):
    parse_id: str


class CorrectRequest(BaseModel):
    parse_id: str
    corrections: dict[str, Any]


# ── Parsed trade fields ──


class ParsedTrade(BaseModel):
    symbol: str
    side: str  # 'long' | 'short'
    quantity: float
    entry_price: float | None = None
    exit_price: float | None = None
    instrument_type: str = "stock"  # 'stock' | 'option' | 'future'
    strike_price: float | None = None
    expiration_date: date | None = None
    option_type: str | None = None  # 'call' | 'put'
    stop_loss: float | None = None
    take_profit: float | None = None
    strategy: str | None = None
    tags: list[str] = Field(default_factory=list)
    notes: str | None = None
    broker: str | None = None
    account_identifier: str | None = None
    trade_date: date | None = None
    campaign_hint: str | None = None


# ── Upstream action preview ──


class UpstreamAction(BaseModel):
    action: str  # 'create' | 'update' | 'close'
    summary: str
    trade_data: dict


# ── Parse response ──


class ParseResponse(BaseModel):
    parse_id: str
    message_id: str
    intent_type: str
    preview: str
    confidence: float
    upstream_actions: list[UpstreamAction]
    validation_errors: list[dict] = Field(default_factory=list)


# ── Confirm response ──


class UpstreamResult(BaseModel):
    action: str
    tradetally_id: str | None = None
    status: int
    summary: str


class ConfirmResponse(BaseModel):
    success: bool
    results: list[UpstreamResult]
    campaign_id: str | None = None


# ── Analytics / query responses ──


class OpenPosition(BaseModel):
    tradetally_id: str
    symbol: str
    side: str
    quantity: float
    entry_price: float
    current_price: float | None = None
    unrealized_pnl: float | None = None
    campaign_name: str | None = None


# ── Campaigns ──

CAMPAIGN_TYPES = frozenset({"wheel", "swing", "scalp", "hedge", "covered_call", "roll_chain", "custom"})


class CampaignCreate(BaseModel):
    name: str | None = None
    campaign_type: str
    symbol: str
    thesis: str | None = None
    meta: dict | None = None

    @field_validator("campaign_type")
    @classmethod
    def validate_campaign_type(cls, v: str) -> str:
        if v not in CAMPAIGN_TYPES:
            raise ValueError(f"campaign_type must be one of {sorted(CAMPAIGN_TYPES)}")
        return v


class CampaignUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    thesis: str | None = None
    meta: dict | None = None


class CampaignDetail(BaseModel):
    id: str
    name: str | None
    campaign_type: str | None
    symbol: str | None
    status: str
    thesis: str | None
    opened_at: str | None
    closed_at: str | None
    total_pnl: float | None
    trade_count: int
    events: list[dict] = Field(default_factory=list)
