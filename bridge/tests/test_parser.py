"""Tests for the deterministic trade message parser."""

from datetime import date

from journal_bridge.parser import parse_deterministic


class TestStockParsing:
    def test_buy_stock_basic(self):
        intent, trade, actions, conf = parse_deterministic("BUY 100 AAPL @ 185.50")
        assert intent == "open"
        assert trade.symbol == "AAPL"
        assert trade.side == "long"
        assert trade.quantity == 100
        assert trade.entry_price == 185.50
        assert conf >= 0.8
        assert len(actions) == 1
        assert actions[0].action == "create"

    def test_buy_stock_with_sl_tp(self):
        intent, trade, actions, conf = parse_deterministic("BUY 100 AAPL @ 185.50 SL 183 TP 190")
        assert trade.stop_loss == 183.0
        assert trade.take_profit == 190.0

    def test_sell_short(self):
        intent, trade, _, _ = parse_deterministic("SELL 50 TSLA @ 250")
        assert trade.side == "short"
        assert trade.quantity == 50

    def test_buy_with_account_and_tags(self):
        intent, trade, _, _ = parse_deterministic("BUY 100 AAPL @ 185.50 account=IBKR tags=swing,breakout")
        assert trade.broker == "IBKR"
        assert trade.tags == ["swing", "breakout"]


class TestOptionParsing:
    def test_bto_call(self):
        intent, trade, actions, conf = parse_deterministic("BTO 2 SPY 17APR26 550C @ 3.20")
        assert intent == "open"
        assert trade.symbol == "SPY"
        assert trade.side == "long"
        assert trade.quantity == 2
        assert trade.entry_price == 3.20
        assert trade.instrument_type == "option"
        assert trade.strike_price == 550.0
        assert trade.option_type == "call"
        assert trade.expiration_date == date(2026, 4, 17)
        assert conf >= 0.8

    def test_sto_put(self):
        intent, trade, _, _ = parse_deterministic("STO 1 NVDA 15MAY26 120P @ 4.20")
        assert trade.side == "short"
        assert trade.option_type == "put"
        assert trade.strike_price == 120.0

    def test_option_with_account(self):
        intent, trade, _, _ = parse_deterministic("BTO 2 SPY 17APR26 550C @ 3.20 account=IBKR tags=earnings")
        assert trade.broker == "IBKR"
        assert trade.tags == ["earnings"]


class TestExitParsing:
    def test_closed_with_price(self):
        intent, trade, actions, conf = parse_deterministic("Closed AAPL @ 190.25")
        assert intent == "close"
        assert trade.symbol == "AAPL"
        assert trade.exit_price == 190.25
        assert actions[0].action == "close"

    def test_stopped_out(self):
        intent, trade, _, _ = parse_deterministic("Stopped out TSLA @ 172")
        assert intent == "close"
        assert trade.symbol == "TSLA"
        assert trade.exit_price == 172.0

    def test_exited(self):
        intent, trade, _, _ = parse_deterministic("Exited MSFT @ 420")
        assert intent == "close"
        assert trade.symbol == "MSFT"

    def test_closed_without_price(self):
        intent, trade, _, conf = parse_deterministic("Closed AAPL long")
        assert intent == "close"
        assert trade.exit_price is None


class TestRollParsing:
    def test_roll_call(self):
        intent, trade, actions, conf = parse_deterministic(
            "Rolled AAPL 190C 17APR26 to 195C 24APR26 for 0.55 credit"
        )
        assert intent == "roll"
        assert len(actions) == 2
        assert actions[0].action == "close"
        assert actions[1].action == "create"
        assert "190" in actions[0].summary and "C" in actions[0].summary
        assert "195" in actions[1].summary and "C" in actions[1].summary
        assert actions[0].trade_data["strikePrice"] == 190.0
        assert actions[0].trade_data["expirationDate"] == "2026-04-17"
        assert actions[1].trade_data["strikePrice"] == 195.0
        assert actions[1].trade_data["expirationDate"] == "2026-04-24"
        assert actions[1].trade_data["entryPrice"] == 0.55
        assert conf >= 0.8

    def test_roll_without_premium(self):
        intent, _, actions, _ = parse_deterministic(
            "Rolled SPY 550C 17APR26 to 555C 24APR26"
        )
        assert intent == "roll"
        assert len(actions) == 2

    def test_roll_debit(self):
        intent, _, actions, _ = parse_deterministic(
            "Roll NVDA 120P 15MAY26 to 115P 22MAY26 for 1.20 debit"
        )
        assert intent == "roll"
        assert "debit" in actions[1].summary


class TestCorrectionParsing:
    def test_correct_price(self):
        intent, _, actions, conf = parse_deterministic("Correct last trade, price was 2.05 not 2.15")
        assert intent == "correct"
        assert conf > 0
        assert actions[0].action == "correct"
        assert actions[0].trade_data["corrections"]["price"] == "2.05"

    def test_correct_quantity(self):
        intent, _, actions, _ = parse_deterministic("Correct last trade, quantity was 50 not 100")
        assert intent == "correct"
        assert actions[0].trade_data["corrections"]["quantity"] == "50"


class TestQueryParsing:
    def test_show_open_positions(self):
        intent, _, actions, conf = parse_deterministic("Show open positions")
        assert intent == "query"
        assert actions[0].trade_data["endpoint"] == "open-positions"

    def test_weekly_pnl(self):
        intent, _, actions, _ = parse_deterministic("Show weekly P&L")
        assert intent == "query"
        assert actions[0].trade_data["endpoint"] == "analytics"

    def test_show_campaigns(self):
        intent, _, actions, _ = parse_deterministic("Show open campaigns")
        assert intent == "query"
        assert actions[0].trade_data["endpoint"] == "campaigns"

    def test_what_is_overview(self):
        intent, _, actions, _ = parse_deterministic("What is my overview")
        assert intent == "query"

    def test_show_performance(self):
        intent, _, actions, _ = parse_deterministic("Show performance")
        assert intent == "query"


class TestUnknownParsing:
    def test_random_text(self):
        intent, trade, actions, conf = parse_deterministic("Hello world this is not a trade")
        assert intent == "unknown"
        assert trade is None
        assert actions == []
        assert conf == 0.0

    def test_empty_string(self):
        intent, _, _, conf = parse_deterministic("")
        assert intent == "unknown"
        assert conf == 0.0
