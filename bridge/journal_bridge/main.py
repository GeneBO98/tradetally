"""FastAPI application for the journal bridge service."""

from __future__ import annotations

import contextvars
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

from journal_bridge.config import settings
from journal_bridge.db import close_pool, get_pool
from journal_bridge.migrations import run_migrations
from journal_bridge.models import (
    CampaignCreate,
    CampaignUpdate,
    ConfirmRequest,
    ConfirmResponse,
    CorrectRequest,
    ParseRequest,
    ParseResponse,
)
from journal_bridge.service import (
    create_campaign,
    cross_reference_trade,
    get_campaign_detail,
    get_campaign_pnl,
    get_tt_client,
    handle_confirm,
    handle_correct,
    handle_parse,
    reconcile_imports,
    report_campaign_summary,
    report_option_income,
    report_parse_accuracy,
    report_weekly_review,
    update_campaign,
)
from journal_bridge.tradetally_client import TradeTallyError

_current_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
_previous_record_factory = logging.getLogRecordFactory()


def _log_record_factory(*args, **kwargs):
    record = _previous_record_factory(*args, **kwargs)
    if not hasattr(record, "request_id"):
        record.request_id = _current_request_id.get()
    return record


class _RequestIDFilter(logging.Filter):
    """Inject request_id from contextvars into all log records."""

    def filter(self, record):
        record.request_id = _current_request_id.get()
        return True


logging.setLogRecordFactory(_log_record_factory)
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s [%(request_id)s]: %(message)s",
)
logging.getLogger().addFilter(_RequestIDFilter())
log = logging.getLogger(__name__)

ALLOWED_ANALYTICS = frozenset({
    "overview", "performance", "symbols", "strategies", "hours",
    "sectors", "drawdown", "maemfe", "monthly", "calendar",
    "calendar/day", "tags",
})


# ── Request ID middleware ──


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        token = _current_request_id.set(req_id)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            _current_request_id.reset(token)


# ── Lifespan ──


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        get_pool()
        if settings.run_migrations:
            run_migrations()
    except Exception as e:
        log.error("Failed to connect to database: %s", e)
        raise
    log.info("Journal bridge starting on port %d", settings.bridge_port)
    log.info("TradeTally upstream: %s", settings.tradetally_url)

    yield

    # Shutdown
    tt = get_tt_client()
    await tt.close()
    close_pool()
    log.info("Journal bridge shut down")


app = FastAPI(title="Journal Bridge", version="0.1.0", lifespan=lifespan)
app.add_middleware(RequestIDMiddleware)


# ── Auth dependency ──


async def verify_api_key(authorization: str = Header(...)) -> None:
    expected = f"Bearer {settings.bridge_api_key}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


# ── Parse endpoint ──


@app.post("/bridge/parse", response_model=ParseResponse)
async def parse_message(req: ParseRequest, _: None = Depends(verify_api_key)) -> ParseResponse:
    try:
        return await handle_parse(req)
    except Exception as e:
        log.exception("Parse failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Confirm endpoint ──


@app.post("/bridge/confirm", response_model=ConfirmResponse)
async def confirm_write(req: ConfirmRequest, _: None = Depends(verify_api_key)) -> ConfirmResponse:
    try:
        return await handle_confirm(req.parse_id)
    except TradeTallyError as e:
        log.error("TradeTally error during confirm: %s (status=%d)", e, e.status)
        raise HTTPException(status_code=502, detail=f"TradeTally error: {e}")
    except Exception as e:
        log.exception("Confirm failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Correct endpoint ──


@app.post("/bridge/correct")
async def correct_trade(req: CorrectRequest, _: None = Depends(verify_api_key)) -> dict:
    try:
        return await handle_correct(req.parse_id, req.corrections)
    except TradeTallyError as e:
        log.error("TradeTally error during correct: %s", e)
        raise HTTPException(status_code=502, detail=f"TradeTally error: {e}")
    except Exception as e:
        log.exception("Correct failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Read endpoints (proxy TradeTally) ──


@app.get("/bridge/open-positions")
async def open_positions(_: None = Depends(verify_api_key)) -> dict:
    try:
        tt = get_tt_client()
        trades = await tt.get_trades({"limit": 100})
        trades_list = trades if isinstance(trades, list) else trades.get("trades", [])
        open_trades = [t for t in trades_list if not t.get("exit_price")]
        return {"positions": open_trades}
    except TradeTallyError as e:
        raise HTTPException(status_code=502, detail=f"TradeTally unreachable: {e}")
    except Exception as e:
        log.exception("open-positions failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/bridge/analytics")
async def analytics(endpoint: str = "overview", _: None = Depends(verify_api_key)) -> dict:
    if endpoint not in ALLOWED_ANALYTICS:
        raise HTTPException(status_code=400, detail="Invalid analytics endpoint")
    try:
        tt = get_tt_client()
        return await tt.get_analytics(endpoint)
    except TradeTallyError as e:
        raise HTTPException(status_code=502, detail=f"TradeTally unreachable: {e}")
    except Exception as e:
        log.exception("analytics failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/bridge/campaigns")
async def list_campaigns(status: str = "open", _: None = Depends(verify_api_key)) -> dict:
    try:
        pool = get_pool()
        with pool.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM journal_ext.campaign WHERE status = %s ORDER BY opened_at DESC LIMIT 100",
                (status,),
            ).fetchall()
        return {"campaigns": [dict(r) for r in rows]}
    except Exception as e:
        log.exception("campaigns query failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Campaign CRUD ──


@app.post("/bridge/campaigns")
async def create_campaign_endpoint(req: CampaignCreate, _: None = Depends(verify_api_key)) -> dict:
    try:
        return await create_campaign(req)
    except Exception as e:
        log.exception("create campaign failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/bridge/campaigns/{campaign_id}")
async def update_campaign_endpoint(campaign_id: str, req: CampaignUpdate, _: None = Depends(verify_api_key)) -> dict:
    try:
        result = await update_campaign(campaign_id, req)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        log.exception("update campaign failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/bridge/campaigns/{campaign_id}")
async def get_campaign_endpoint(campaign_id: str, _: None = Depends(verify_api_key)) -> dict:
    try:
        detail = await get_campaign_detail(campaign_id)
        if not detail:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return detail.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        log.exception("get campaign failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/bridge/campaigns/{campaign_id}")
async def close_campaign_endpoint(campaign_id: str, _: None = Depends(verify_api_key)) -> dict:
    try:
        result = await update_campaign(campaign_id, CampaignUpdate(status="closed"))
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        log.exception("close campaign failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/bridge/campaigns/{campaign_id}/pnl")
async def campaign_pnl_endpoint(campaign_id: str, _: None = Depends(verify_api_key)) -> dict:
    try:
        return await get_campaign_pnl(campaign_id)
    except Exception as e:
        log.exception("campaign pnl failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Reports ──


@app.get("/bridge/reports/campaign-summary")
async def campaign_summary_report(type: str | None = None, _: None = Depends(verify_api_key)) -> dict:
    try:
        return {"campaigns": await report_campaign_summary(type)}
    except Exception as e:
        log.exception("campaign summary report failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/bridge/reports/option-income")
async def option_income_report(_: None = Depends(verify_api_key)) -> dict:
    try:
        return {"income": await report_option_income()}
    except Exception as e:
        log.exception("option income report failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/bridge/reports/parse-accuracy")
async def parse_accuracy_report(_: None = Depends(verify_api_key)) -> dict:
    try:
        return {"accuracy": await report_parse_accuracy()}
    except Exception as e:
        log.exception("parse accuracy report failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/bridge/reports/weekly-review")
async def weekly_review_report(_: None = Depends(verify_api_key)) -> dict:
    try:
        return await report_weekly_review()
    except TradeTallyError as e:
        raise HTTPException(status_code=502, detail=f"TradeTally unreachable: {e}")
    except Exception as e:
        log.exception("weekly review report failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Health ──


# ── Cross-referencing ──


@app.get("/bridge/cross-ref/{tradetally_id}")
async def cross_ref_endpoint(tradetally_id: str, _: None = Depends(verify_api_key)) -> dict:
    try:
        return await cross_reference_trade(tradetally_id)
    except Exception as e:
        log.exception("cross-reference failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Reconciliation ──


@app.post("/bridge/reconcile")
async def reconcile_endpoint(_: None = Depends(verify_api_key)) -> dict:
    try:
        return await reconcile_imports()
    except TradeTallyError as e:
        raise HTTPException(status_code=502, detail=f"TradeTally unreachable: {e}")
    except Exception as e:
        log.exception("reconciliation failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Health ──


@app.get("/health")
async def health() -> dict:
    status = {"status": "ok", "service": "journal-bridge", "version": "0.1.0"}
    # DB pool stats
    try:
        pool = get_pool()
        stats = pool.get_stats()
        status["db_pool"] = {
            "size": stats.get("pool_size", 0),
            "available": stats.get("pool_available", 0),
            "waiting": stats.get("requests_waiting", 0),
        }
    except Exception as e:
        status["db_pool"] = {"status": "unavailable", "error": str(e)}
    # TradeTally reachability
    try:
        import httpx
        async with httpx.AsyncClient(timeout=3) as c:
            resp = await c.get(f"{settings.tradetally_url}/api/auth/config")
            status["tradetally"] = "reachable" if resp.status_code == 200 else f"status {resp.status_code}"
    except Exception:
        status["tradetally"] = "unreachable"
    return status


def run() -> None:
    import uvicorn
    uvicorn.run(
        "journal_bridge.main:app",
        host="127.0.0.1",
        port=settings.bridge_port,
        reload=False,
    )


if __name__ == "__main__":
    run()
