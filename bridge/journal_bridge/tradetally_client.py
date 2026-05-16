"""HTTP client for TradeTally REST API. Bridge holds the JWT credential."""

from __future__ import annotations

import asyncio
import logging
import time

import httpx

from journal_bridge.config import settings

log = logging.getLogger(__name__)

_jwt_token: str | None = None
_jwt_expires_at: float = 0
_jwt_lock = asyncio.Lock()


class TradeTallyError(Exception):
    """Raised when a TradeTally API call fails."""

    def __init__(self, message: str, status: int = 0, body: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.body = body


async def _login(client: httpx.AsyncClient) -> str:
    """Authenticate to TradeTally and cache the JWT."""
    global _jwt_token, _jwt_expires_at
    try:
        resp = await client.post(
            f"{settings.tradetally_url}/api/auth/login",
            json={"email": settings.tradetally_email, "password": settings.tradetally_password},
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise TradeTallyError(
            f"TradeTally login failed: {e.response.status_code}",
            status=e.response.status_code,
            body=e.response.text,
        ) from e
    except httpx.ConnectError as e:
        raise TradeTallyError(f"TradeTally unreachable: {e}") from e
    data = resp.json()
    _jwt_token = data["token"]
    _jwt_expires_at = time.time() + 6 * 24 * 3600
    log.info("Authenticated to TradeTally")
    return _jwt_token


async def _get_token(client: httpx.AsyncClient) -> str:
    async with _jwt_lock:
        if _jwt_token is None or time.time() > _jwt_expires_at:
            return await _login(client)
        return _jwt_token


async def _invalidate_token() -> None:
    global _jwt_token, _jwt_expires_at
    async with _jwt_lock:
        _jwt_token = None
        _jwt_expires_at = 0


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _request_with_retry(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    idempotency_key: str | None = None,
    **kwargs,
) -> httpx.Response:
    """Make a request, retry once on 401 (re-login)."""
    token = await _get_token(client)
    headers = _auth_headers(token)
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    kwargs.setdefault("headers", {}).update(headers)

    try:
        resp = await client.request(method, url, **kwargs)
    except httpx.ConnectError as e:
        raise TradeTallyError(f"TradeTally unreachable: {e}") from e

    if resp.status_code == 401:
        log.info("JWT expired, re-authenticating")
        await _invalidate_token()
        token = await _get_token(client)
        kwargs["headers"].update(_auth_headers(token))
        try:
            resp = await client.request(method, url, **kwargs)
        except httpx.ConnectError as e:
            raise TradeTallyError(f"TradeTally unreachable: {e}") from e

    if resp.status_code >= 400:
        raise TradeTallyError(
            f"TradeTally {method} {url} returned {resp.status_code}",
            status=resp.status_code,
            body=resp.text,
        )
    return resp


class TradeTallyClient:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(timeout=30)

    async def close(self) -> None:
        await self._client.aclose()

    async def create_trade(self, trade_data: dict, idempotency_key: str) -> dict:
        resp = await _request_with_retry(
            self._client, "POST",
            f"{settings.tradetally_url}/api/trades",
            idempotency_key=idempotency_key,
            json=trade_data,
        )
        return resp.json()

    async def update_trade(self, trade_id: str, trade_data: dict, idempotency_key: str) -> dict:
        resp = await _request_with_retry(
            self._client, "PUT",
            f"{settings.tradetally_url}/api/trades/{trade_id}",
            idempotency_key=idempotency_key,
            json=trade_data,
        )
        return resp.json()

    async def get_trades(self, params: dict | None = None) -> dict:
        resp = await _request_with_retry(
            self._client, "GET",
            f"{settings.tradetally_url}/api/trades",
            params=params or {},
        )
        return resp.json()

    async def get_analytics(self, endpoint: str = "overview", params: dict | None = None) -> dict:
        resp = await _request_with_retry(
            self._client, "GET",
            f"{settings.tradetally_url}/api/analytics/{endpoint}",
            params=params or {},
        )
        return resp.json()
