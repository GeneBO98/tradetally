/**
 * US equity market clock helpers (America/New_York), used by background
 * market-data jobs to decide how often provider calls are worth making.
 *
 * Holidays are treated as normal weekdays; the cost is a few extra refreshes
 * on ~10 days a year, which is not worth a holiday calendar dependency.
 */

const MARKET_TIME_ZONE = 'America/New_York';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Pre-market opens 04:00 ET, after-hours closes 20:00 ET.
const EXTENDED_SESSION_START_MINUTES = 4 * 60;
const EXTENDED_SESSION_END_MINUTES = 20 * 60;

// Window where company news is worth polling hourly.
const NEWS_PEAK_START_MINUTES = 6 * 60;
const NEWS_PEAK_END_MINUTES = 20 * 60;

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'shortOffset'
});

function easternParts(date = new Date()) {
  const parts = formatter.formatToParts(date);
  const part = type => parts.find(candidate => candidate.type === type)?.value;
  const offsetMatch = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part('timeZoneName') || '');
  const offsetMinutes = offsetMatch
    ? (offsetMatch[1] === '-' ? -1 : 1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] || 0))
    : 0;

  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    weekday: WEEKDAYS.indexOf(part('weekday')),
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
    offsetMinutes
  };
}

function isWeekday(weekday) {
  return weekday >= 1 && weekday <= 5;
}

function isWithinWeekdayWindow(date, startMinutes, endMinutes) {
  const { weekday, minutes } = easternParts(date);
  return isWeekday(weekday) && minutes >= startMinutes && minutes < endMinutes;
}

/** Weekday 04:00-20:00 ET: quotes can move. */
function isExtendedHoursSession(date = new Date()) {
  return isWithinWeekdayWindow(date, EXTENDED_SESSION_START_MINUTES, EXTENDED_SESSION_END_MINUTES);
}

/** Weekday 06:00-20:00 ET: headlines that matter to traders mostly land here. */
function isNewsPeakWindow(date = new Date()) {
  return isWithinWeekdayWindow(date, NEWS_PEAK_START_MINUTES, NEWS_PEAK_END_MINUTES);
}

/**
 * The most recent weekday 20:00 ET at or before `date`. A quote refreshed
 * after this instant already reflects the final after-hours print, so there
 * is nothing to gain from refreshing it again before the next pre-market.
 */
function lastExtendedSessionClose(date = new Date()) {
  const now = easternParts(date);
  const cursor = new Date(Date.UTC(now.year, now.month - 1, now.day));

  const closedToday = isWeekday(now.weekday) && now.minutes >= EXTENDED_SESSION_END_MINUTES;
  if (!closedToday) {
    do {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } while (!isWeekday(cursor.getUTCDay()));
  }

  const closeHour = EXTENDED_SESSION_END_MINUTES / 60;
  const wallClockAsUtc = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), closeHour);
  // Resolve the ET offset at (approximately) that instant so DST is honored.
  const { offsetMinutes } = easternParts(new Date(wallClockAsUtc + 5 * 60 * 60 * 1000));
  return new Date(wallClockAsUtc - offsetMinutes * 60 * 1000);
}

module.exports = {
  MARKET_TIME_ZONE,
  easternParts,
  isExtendedHoursSession,
  isNewsPeakWindow,
  lastExtendedSessionClose
};
