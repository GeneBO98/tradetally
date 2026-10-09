const PUBLIC_TRADE_FIELDS = Object.freeze([
  'id', 'symbol', 'side', 'trade_date', 'entry_time', 'exit_time',
  'entry_price', 'exit_price', 'quantity', 'pnl', 'pnl_percent',
  'commission', 'fees', 'entry_commission', 'exit_commission', 'broker',
  'instrument_type', 'option_type', 'strike_price', 'expiration_date',
  'contract_size', 'underlying_symbol', 'contract_month', 'contract_year',
  'point_value', 'tick_size', 'stop_loss', 'take_profit',
  'take_profit_targets', 'r_value', 'management_r', 'mae', 'mfe',
  'post_exit_mae', 'post_exit_mfe', 'strategy', 'setup', 'tags', 'notes',
  'confidence', 'is_public', 'quality_grade', 'quality_score', 'has_news',
  'news_events', 'news_sentiment', 'created_at', 'updated_at', 'username',
  'display_name', 'avatar_url', 'comment_count', 'sector', 'company_name',
  'attachment_urls'
]);

const DERIVED_PUBLIC_FIELDS = new Set([
  'username', 'display_name', 'avatar_url', 'comment_count',
  'sector', 'company_name', 'attachment_urls'
]);

function sanitizePublicTrade(trade) {
  const sanitized = {};
  for (const field of PUBLIC_TRADE_FIELDS) {
    if (trade[field] !== undefined) sanitized[field] = trade[field];
  }

  if (trade.anonymous_username) {
    sanitized.username = trade.anonymous_username;
    sanitized.display_name = trade.anonymous_username;
  }
  sanitized.avatar_url = null;

  if (Array.isArray(trade.attachments)) {
    sanitized.attachments = trade.attachments.map(attachment => ({
      id: attachment.id,
      file_url: attachment.file_url,
      file_type: attachment.file_type
    }));
  }

  if (Array.isArray(trade.charts)) {
    sanitized.charts = trade.charts.map(chart => ({
      id: chart.id,
      chart_url: chart.chart_url,
      chart_title: chart.chart_title,
      uploaded_at: chart.uploaded_at
    }));
  }

  return sanitized;
}

function getPublicTradeSqlColumns(alias = 't') {
  return PUBLIC_TRADE_FIELDS
    .filter(field => !DERIVED_PUBLIC_FIELDS.has(field))
    .map(field => `${alias}.${field}`)
    .join(',\n        ');
}

module.exports = {
  PUBLIC_TRADE_FIELDS,
  getPublicTradeSqlColumns,
  sanitizePublicTrade
};
