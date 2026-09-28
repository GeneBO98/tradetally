// Explicit reporting boundaries are inclusive calendar dates.
function parseReportDateRange(query = {}) {
  const { start_date, end_date } = query;
  if (start_date === undefined && end_date === undefined) return null;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDate(start_date) || !validDate(end_date) || start_date > end_date) {
    const error = new Error('start_date and end_date must be valid YYYY-MM-DD dates in ascending order');
    error.status = 400;
    throw error;
  }
  return { start_date, end_date };
}
module.exports = { parseReportDateRange };
