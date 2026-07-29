const {
  CPI_SERIES_ID,
  calculateHistoricalInflation
} = require('../../src/services/historicalInflationService');

function monthlyCpi(startYear, startMonth, count, annualInflationPercent) {
  const points = [];
  const monthlyRate = ((1 + (annualInflationPercent / 100)) ** (1 / 12)) - 1;
  let value = 250;
  const date = new Date(Date.UTC(startYear, startMonth - 1, 1));

  for (let index = 0; index < count; index += 1) {
    points.push({
      date: date.toISOString().split('T')[0],
      value
    });
    value *= (1 + monthlyRate);
    date.setUTCMonth(date.getUTCMonth() + 1);
  }

  return points;
}

describe('HistoricalInflationService', () => {
  test('annualizes CPI-U inflation across a matching historical period', () => {
    const result = calculateHistoricalInflation(
      monthlyCpi(2020, 1, 73, 3),
      {
        period_years: 5,
        data_start: '2021-01-15',
        data_end: '2026-01-20'
      }
    );

    expect(result.inflation_rate_percent).toBeCloseTo(3, 2);
    expect(result.inflation_source).toBe('historical_us_cpi_u');
    expect(result.inflation_series_id).toBe(CPI_SERIES_ID);
    expect(result.inflation_time_coverage_percent).toBe(100);
  });

  test('rejects historical inflation with less than eighty percent coverage', () => {
    const result = calculateHistoricalInflation(
      monthlyCpi(2025, 6, 5, 3),
      {
        period_years: 1,
        data_start: '2025-01-01',
        data_end: '2026-01-01'
      }
    );

    expect(result).toBeNull();
  });
});
