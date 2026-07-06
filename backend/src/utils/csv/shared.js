const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('../futuresUtils');


function parseDate(dateStr) {
  if (!dateStr || dateStr.toString().trim() === '') return null;

  // Remove leading and trailing quotes/apostrophes (including Unicode curly quotes), then trim
  const cleanDateStr = dateStr.toString().replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();
  const normalizedDateStr = cleanDateStr.replace(
    /^([A-Za-z]+ \d{1,2}, \d{4})(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)$/i,
    '$1 $2'
  );

  const ddmmyyyyMatch = normalizedDateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s|$)/);
  if (ddmmyyyyMatch) {
    const [_, day, month, year] = ddmmyyyyMatch;
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;

    const date = new Date(yearNum, monthNum - 1, dayNum);
    if (date.getFullYear() !== yearNum || date.getMonth() !== monthNum - 1 || date.getDate() !== dayNum) {
      return null;
    }

    return `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  }

  // Try to parse IBKR format XX-XX-YY (could be MM-DD-YY or DD-MM-YY)
  const xxyyMatch = normalizedDateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2})/);
  if (xxyyMatch) {
    const [_, first, second, shortYear] = xxyyMatch;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const yearNum = 2000 + parseInt(shortYear);

    // Determine if this is MM-DD-YY or DD-MM-YY format
    // If first > 12, it must be DD-MM-YY (day first)
    // If second > 12, it must be MM-DD-YY (month first)
    // If both <= 12, assume DD-MM-YY (more common internationally and in IBKR Activity Statements)
    let monthNum, dayNum;
    if (firstNum > 12) {
      // First number is too large to be a month, so it's DD-MM-YY
      dayNum = firstNum;
      monthNum = secondNum;
    } else if (secondNum > 12) {
      // Second number is too large to be a month, so it's MM-DD-YY
      monthNum = firstNum;
      dayNum = secondNum;
    } else {
      // Ambiguous - default to DD-MM-YY (IBKR Activity Statement format)
      dayNum = firstNum;
      monthNum = secondNum;
    }

    // Validate date components for PostgreSQL 16 compatibility
    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2099) return null;

    // Create date in YYYY-MM-DD format
    const monthPadded = monthNum.toString().padStart(2, '0');
    const dayPadded = dayNum.toString().padStart(2, '0');

    return `${yearNum}-${monthPadded}-${dayPadded}`;
  }

  // Try to parse IBKR Flex Query format: YYYYMMDD or YYYYMMDD;HHMMSS
  // This format is used in IBKR Japan and other regional Flex Query exports
  const ibkrFlexMatch = normalizedDateStr.match(/^(\d{4})(\d{2})(\d{2})(;(\d{2})(\d{2})(\d{2}))?$/);
  if (ibkrFlexMatch) {
    const [, year, month, day] = ibkrFlexMatch;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);

    // Validate date components for PostgreSQL 16 compatibility
    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;

    return `${year}-${month}-${day}`;
  }

  // Try to parse slash-separated YYYY dates. Prefer MM/DD/YYYY for ambiguous
  // US-style dates, but accept DD/MM/YYYY when the first component cannot be a
  // month.
  const mmddyyyyMatch = normalizedDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mmddyyyyMatch) {
    const [_, first, second, year] = mmddyyyyMatch;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const monthNum = firstNum > 12 ? secondNum : firstNum;
    const dayNum = firstNum > 12 ? firstNum : secondNum;
    const yearNum = parseInt(year);

    // Validate date components for PostgreSQL 16 compatibility
    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;

    // Validate the date is actually valid (e.g., not Feb 30)
    const date = new Date(yearNum, monthNum - 1, dayNum);
    if (date.getFullYear() !== yearNum || date.getMonth() !== monthNum - 1 || date.getDate() !== dayNum) {
      return null; // Invalid date (e.g., Feb 30)
    }

    // Create date in YYYY-MM-DD format directly to avoid timezone issues
    const monthPadded = monthNum.toString().padStart(2, '0');
    const dayPadded = dayNum.toString().padStart(2, '0');
    return `${yearNum}-${monthPadded}-${dayPadded}`;
  }

  // Try to parse MM/DD/YY format (2-digit year with slashes, used in some IBKR Flex Query exports)
  // Also handles MM/DD/YY;HHMMSS by matching only the date portion
  const mmddyySlashMatch = normalizedDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:;|$|\s)/);
  if (mmddyySlashMatch) {
    const [_, month, day, shortYear] = mmddyySlashMatch;
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    const yearNum = 2000 + parseInt(shortYear);

    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;

    const monthPadded = monthNum.toString().padStart(2, '0');
    const dayPadded = dayNum.toString().padStart(2, '0');
    return `${yearNum}-${monthPadded}-${dayPadded}`;
  }

  const monthNameMatch = normalizedDateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (monthNameMatch) {
    const [, monthName, day, year] = monthNameMatch;
    const date = new Date(`${monthName} ${day}, ${year}`);
    if (isNaN(date.getTime())) return null;

    const yearNum = date.getFullYear();
    if (yearNum < 1900 || yearNum > 2100) return null;

    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yearNum}-${mm}-${dd}`;
  }
  
  // Fall back to default date parsing with validation
  try {
    const date = new Date(normalizedDateStr);
    if (isNaN(date.getTime())) return null;

    // Additional validation for PostgreSQL 16
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) return null;

    // Use local date components to avoid timezone shifting
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (error) {
    console.warn(`Invalid date format: ${cleanDateStr}`);
    return null;
  }
}

function parseTimeOnly(timeStr) {
  if (!timeStr || timeStr.toString().trim() === '') return null;

  const cleanTimeStr = timeStr.toString().replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();
  // Match a leading clock time, tolerating a trailing timezone annotation such as
  // "04:47:39,GMT-04" (Tiger Brokers), "09:30:00 EST", or "13:05 GMT+0530".
  // The lookahead requires end-of-string or a non-time character after the time,
  // so this never grabs a partial time out of a full datetime (which starts with a date).
  const timeOnlyMatch = cleanTimeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?=$|[^\d:])/);
  if (!timeOnlyMatch) return null;

  const [, hour, minute, second = '00'] = timeOnlyMatch;
  const hourNum = parseInt(hour, 10);
  const minuteNum = parseInt(minute, 10);
  const secondNum = parseInt(second, 10);

  if (hourNum < 0 || hourNum > 23 || minuteNum < 0 || minuteNum > 59 || secondNum < 0 || secondNum > 59) {
    return null;
  }

  return `${hour.padStart(2, '0')}:${minute}:${second.padStart(2, '0')}`;
}

function extractDateFromFilename(fileName) {
  if (!fileName || typeof fileName !== 'string') return null;

  const patterns = [
    /\b(20\d{2})[-_](\d{1,2})[-_](\d{1,2})\b/,
    /\b(\d{1,2})[-_](\d{1,2})[-_](20\d{2})\b/,
    /\b(20\d{2})(\d{2})(\d{2})\b/
  ];

  for (let index = 0; index < patterns.length; index++) {
    const match = fileName.match(patterns[index]);
    if (!match) continue;

    let candidate;
    if (index === 0) {
      const [, year, month, day] = match;
      candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else if (index === 1) {
      const [, month, day, year] = match;
      candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else {
      const [, year, month, day] = match;
      candidate = `${year}-${month}-${day}`;
    }

    if (parseDate(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parseDateTime(dateTimeStr) {
  if (!dateTimeStr || dateTimeStr.toString().trim() === '') return null;

  // Remove leading and trailing quotes/apostrophes (including Unicode curly quotes), then trim
  const cleanDateTimeStr = dateTimeStr.toString().replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();
  const normalizedDateTimeStr = cleanDateTimeStr.replace(
    /^([A-Za-z]+ \d{1,2}, \d{4})(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)$/i,
    '$1 $2'
  );
  const timezoneAbbreviationOffsets = {
    UTC: 'Z',
    GMT: 'Z',
    EST: '-05:00',
    EDT: '-04:00',
    CST: '-06:00',
    CDT: '-05:00',
    MST: '-07:00',
    MDT: '-06:00',
    PST: '-08:00',
    PDT: '-07:00'
  };
  const trailingTimezoneMatch = normalizedDateTimeStr.match(/^(.*?)(?:\s+([A-Z]{2,4}))$/);
  const trailingTimezone = trailingTimezoneMatch?.[2]?.toUpperCase();
  const trailingTimezoneOffset = trailingTimezone && timezoneAbbreviationOffsets[trailingTimezone]
    ? timezoneAbbreviationOffsets[trailingTimezone]
    : null;
  const dateTimeBody = trailingTimezoneOffset
    ? trailingTimezoneMatch[1].trim()
    : normalizedDateTimeStr;

  const normalizeTimezoneOffset = (offset) => {
    if (!offset || offset === 'Z') return 'Z';
    return /^[+-]\d{4}$/.test(offset)
      ? `${offset.slice(0, 3)}:${offset.slice(3)}`
      : offset;
  };
  const withTrailingTimezone = (value) => {
    if (!value || !trailingTimezoneOffset) return value;
    return `${value}${normalizeTimezoneOffset(trailingTimezoneOffset)}`;
  };

  try {
    // Preserve ISO timestamps that already include timezone information.
    const isoWithTimezoneMatch = dateTimeBody.match(
      /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i
    );
    if (isoWithTimezoneMatch) {
      const [, datePart, hour, minute, second = '00', offset] = isoWithTimezoneMatch;
      return `${datePart}T${hour}:${minute}:${second}${normalizeTimezoneOffset(offset.toUpperCase())}`;
    }

    // Check for MM/DD/YYYY HH:MM:SS +TZ format (ProjectX with timezone)
    const mmddyyyyTimeWithTzMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+([+-]\d{2}:?\d{2})$/);
    if (mmddyyyyTimeWithTzMatch) {
      const [, month, day, year, hour, minute, second, offset] = mmddyyyyTimeWithTzMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return `${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:${second}${normalizeTimezoneOffset(offset)}`;
    }

    // Check for slash-separated YYYY datetime. Prefer MM/DD/YYYY for
    // ambiguous US-style dates, but accept DD/MM/YYYY when the first component
    // cannot be a month. Fractional seconds are ignored.
    const mmddyyyyTimeMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (mmddyyyyTimeMatch) {
      const [, first, secondDatePart, year, hour, minute, second] = mmddyyyyTimeMatch;
      const firstNum = parseInt(first);
      const secondNum = parseInt(secondDatePart);
      const month = firstNum > 12 ? secondDatePart : first;
      const day = firstNum > 12 ? first : secondDatePart;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:${second}`);
    }

    // Check for MM/DD/YYYY HH:MM format (without seconds)
    const mmddyyyyTimeNoSecMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (mmddyyyyTimeNoSecMatch) {
      const [, month, day, year, hour, minute] = mmddyyyyTimeNoSecMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:00`);
    }

    const ddmmyyyyTimeMatch = dateTimeBody.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (ddmmyyyyTimeMatch) {
      const [, day, month, year, hour, minute, second] = ddmmyyyyTimeMatch;
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);

      if (monthNum < 1 || monthNum > 12) return null;
      if (dayNum < 1 || dayNum > 31) return null;
      if (yearNum < 1900 || yearNum > 2100) return null;

      const date = new Date(yearNum, monthNum - 1, dayNum);
      if (date.getFullYear() !== yearNum || date.getMonth() !== monthNum - 1 || date.getDate() !== dayNum) {
        return null;
      }

      return withTrailingTimezone(
        `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}`
      );
    }

    // Check for IBKR Flex Query format: YYYYMMDD;HHMMSS (used in IBKR Japan and other regional exports)
    const ibkrFlexDateTimeMatch = dateTimeBody.match(/^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})(\d{2})$/);
    if (ibkrFlexDateTimeMatch) {
      const [, year, month, day, hour, minute, second] = ibkrFlexDateTimeMatch;
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);

      // Validate date components
      if (monthNum < 1 || monthNum > 12) return null;
      if (dayNum < 1 || dayNum > 31) return null;
      if (yearNum < 1900 || yearNum > 2100) return null;

      return withTrailingTimezone(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    }

    // Check for MM/DD/YY;HHMMSS format (IBKR Flex Query with slash-separated dates)
    const mmddyyFlexMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2});(\d{2})(\d{2})(\d{2})$/);
    if (mmddyyFlexMatch) {
      const [, month, day, shortYear, hour, minute, second] = mmddyyFlexMatch;
      const yearNum = 2000 + parseInt(shortYear);
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);

      if (monthNum < 1 || monthNum > 12) return null;
      if (dayNum < 1 || dayNum > 31) return null;
      if (yearNum < 1900 || yearNum > 2100) return null;

      const monthPadded = monthNum.toString().padStart(2, '0');
      const dayPadded = dayNum.toString().padStart(2, '0');
      return withTrailingTimezone(`${yearNum}-${monthPadded}-${dayPadded}T${hour}:${minute}:${second}`);
    }

    // Check for IBKR format "XX-XX-YY H:MM" or "XX-XX-YY HH:MM" (could be MM-DD-YY or DD-MM-YY)
    const ibkrDateTimeMatch = dateTimeBody.match(/^(\d{1,2})-(\d{1,2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (ibkrDateTimeMatch) {
      const [, first, second, shortYear, hour, minute] = ibkrDateTimeMatch;
      const year = 2000 + parseInt(shortYear); // Convert YY to YYYY
      const firstNum = parseInt(first);
      const secondNum = parseInt(second);

      // Determine if this is MM-DD-YY or DD-MM-YY format
      // If first > 12, it must be DD-MM-YY (day first)
      // If second > 12, it must be MM-DD-YY (month first)
      // If both <= 12, assume DD-MM-YY (IBKR Activity Statement format)
      let monthNum, dayNum;
      if (firstNum > 12) {
        dayNum = firstNum;
        monthNum = secondNum;
      } else if (secondNum > 12) {
        monthNum = firstNum;
        dayNum = secondNum;
      } else {
        // Ambiguous - default to DD-MM-YY
        dayNum = firstNum;
        monthNum = secondNum;
      }

      const monthPadded = monthNum.toString().padStart(2, '0');
      const dayPadded = dayNum.toString().padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:00`);
    }

    // Check if the string is in format "YYYY-MM-DD HH:MM:SS" (local time without timezone)
    const localDateTimeMatch = dateTimeBody.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (localDateTimeMatch) {
      const [, year, month, day, hour, minute, second] = localDateTimeMatch;
      // Return as-is without timezone conversion
      return withTrailingTimezone(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    }

    // Check if just a date is provided (no time component)
    const dateOnlyMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dateOnlyMatch) {
      const [, month, day, year] = dateOnlyMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      // Default to 09:30 (market open) if no time provided
      return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T09:30:00`);
    }

    // ISO date-only YYYY-MM-DD (CapTrader Transaction History exports a Date column without time)
    const isoDateOnlyMatch = dateTimeBody.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateOnlyMatch) {
      const [, year, month, day] = isoDateOnlyMatch;
      // Default to 09:30 (market open) when no time is provided
      return withTrailingTimezone(`${year}-${month}-${day}T09:30:00`);
    }

    const monthNameDateTimeMatch = dateTimeBody.match(
      /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i
    );
    if (monthNameDateTimeMatch) {
      let [, monthName, day, year, hour, minute, second = '00', ampm] = monthNameDateTimeMatch;
      let hourNum = parseInt(hour, 10);
      if (ampm.toUpperCase() === 'PM' && hourNum !== 12) hourNum += 12;
      if (ampm.toUpperCase() === 'AM' && hourNum === 12) hourNum = 0;

      const date = new Date(`${monthName} ${day}, ${year}`);
      if (isNaN(date.getTime())) return null;

      const month = String(date.getMonth() + 1).padStart(2, '0');
      const normalizedDay = String(date.getDate()).padStart(2, '0');
      const normalizedHour = String(hourNum).padStart(2, '0');
      return withTrailingTimezone(`${year}-${month}-${normalizedDay}T${normalizedHour}:${minute}:${second}`);
    }

    // Otherwise, parse manually to avoid timezone issues
    // Try to extract date and time components without Date object conversion
    const spaceSplit = dateTimeBody.split(' ');
    if (spaceSplit.length >= 2) {
      const datePart = spaceSplit[0];
      const timePart = spaceSplit[1];

      // Parse date part
      let year, month, day;
      if (datePart.includes('/')) {
        const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dateMatch) {
          const [, first, second, parsedYear] = dateMatch;
          const firstNum = parseInt(first);
          year = parsedYear;
          month = firstNum > 12 ? second : first;
          day = firstNum > 12 ? first : second;
        }
      } else if (datePart.includes('-')) {
        const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
          [, year, month, day] = dateMatch;
        }
      }

      // Parse time part
      const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
      if (year && month && day && timeMatch) {
        const [, hour, minute, second = '00'] = timeMatch;
        const monthPadded = month.padStart(2, '0');
        const dayPadded = day.padStart(2, '0');
        const hourPadded = hour.padStart(2, '0');
        return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:${second}`);
      }
    }

    // Last resort: use Date parsing but extract components carefully
    const date = new Date(dateTimeBody);
    if (isNaN(date.getTime())) return null;

    // Additional validation for PostgreSQL 16
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) return null;

    // Format as ISO string in local time to avoid timezone shifting
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return withTrailingTimezone(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);
  } catch (error) {
    console.warn(`Invalid datetime format: ${cleanDateTimeStr}`);
    return null;
  }
}

function hasExplicitTimezone(dateTimeStr) {
  return typeof dateTimeStr === 'string' &&
    (dateTimeStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateTimeStr));
}

function compareCanonicalDateTimes(left, right) {
  if (left === right) return 0;

  const leftHasTimezone = hasExplicitTimezone(left);
  const rightHasTimezone = hasExplicitTimezone(right);

  if (leftHasTimezone || rightHasTimezone) {
    const leftTime = new Date(left).getTime();
    const rightTime = new Date(right).getTime();

    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
  }

  return left.localeCompare(right);
}

function getExecutionTimeBounds(executions = []) {
  const datetimes = executions
    .map((execution) => execution?.datetime)
    .filter((value) => typeof value === 'string' && value.trim() !== '');

  if (datetimes.length === 0) {
    return { entryTime: null, exitTime: null };
  }

  const sortedTimes = [...datetimes].sort(compareCanonicalDateTimes);
  return {
    entryTime: sortedTimes[0],
    exitTime: sortedTimes[sortedTimes.length - 1]
  };
}

function parseSide(sideStr) {
  if (!sideStr) return 'long';
  const normalized = sideStr.toString().trim().toLowerCase();
  if (
    normalized === 's' ||
    normalized === 'short' ||
    normalized === 'sell' ||
    normalized === 'sold' ||
    normalized === 'sto' ||
    normalized === 'stc' ||
    normalized.includes('short') ||
    normalized.includes('sell')
  ) return 'short';
  return 'long';
}

const POSITION_CLOSE_TOLERANCE = 1e-8;

function normalizePositionQuantity(quantity) {
  const numericQuantity = Number(quantity || 0);
  return Math.abs(numericQuantity) <= POSITION_CLOSE_TOLERANCE ? 0 : numericQuantity;
}

function parseTradervueSide(sideStr) {
  const normalized = cleanString(sideStr).toUpperCase();
  if (normalized === 'S') return 'short';
  if (normalized === 'L') return 'long';
  return parseSide(sideStr);
}

function cleanString(str) {
  if (!str) return '';
  return str.toString().trim();
}

function parseTagList(tagValue) {
  const raw = cleanString(tagValue);
  if (!raw) return [];
  return raw
    .split(/[;,|]/)
    .map(tag => cleanString(tag))
    .filter(Boolean);
}

/**
 * Creates a case-insensitive proxy around a CSV record object.
 * Exact key matches are tried first (preserving existing behavior),
 * then a case-insensitive + trimmed fallback is used.
 * This handles CSVs where header casing differs from what parsers expect
 * (e.g. "symbol" vs "Symbol", "DATE" vs "Date").
 */
function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const lowerMap = new Map();
  for (const key of Object.keys(record)) {
    const normalized = key.toLowerCase().trim();
    // First key wins for a given normalized form, preserving original casing priority
    if (!lowerMap.has(normalized)) {
      lowerMap.set(normalized, key);
    }
  }
  return new Proxy(record, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        // Exact match first (fast path, preserves existing behavior)
        if (prop in target) return target[prop];
        // Case-insensitive fallback
        const originalKey = lowerMap.get(prop.toLowerCase().trim());
        if (originalKey) return target[originalKey];
      }
      return Reflect.get(target, prop, receiver);
    },
    // Support `prop in record` checks
    has(target, prop) {
      if (prop in target) return true;
      if (typeof prop === 'string') {
        return lowerMap.has(prop.toLowerCase().trim());
      }
      return false;
    },
    // Preserve Object.keys() behavior (returns original keys)
    ownKeys(target) {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, prop) {
      // For original keys, return real descriptor
      if (prop in target) return Object.getOwnPropertyDescriptor(target, prop);
      // For case-insensitive matches, synthesize a descriptor
      if (typeof prop === 'string') {
        const originalKey = lowerMap.get(prop.toLowerCase().trim());
        if (originalKey) {
          return { value: target[originalKey], writable: true, enumerable: true, configurable: true };
        }
      }
      return undefined;
    }
  });
}

// Parse options/futures instrument data from symbol
function parseInstrumentData(symbol) {
  if (!symbol) {
    return { instrumentType: 'stock' };
  }

  // Normalize: uppercase and standardize spaces
  const normalizedSymbol = symbol.toString().toUpperCase().replace(/\s+/g, ' ').trim();

  // Compact options with space: "Cl 251024C00322500" -> "CL251024C00322500" for pattern matching
  const symbolNoSpaces = normalizedSymbol.replace(/\s+/g, '');

  // Readable IBKR options format: "DIA 10OCT25 466 PUT" (underlying + date + strike + type)
  const readableOptionMatch = normalizedSymbol.match(/^([A-Z]+)\s+(\d{1,2})([A-Z]{3})(\d{2})\s+(\d+(?:\.\d+)?)\s+(PUT|CALL)$/i);
  if (readableOptionMatch) {
    const [, underlying, day, monthStr, year, strike, type] = readableOptionMatch;

    // Convert month abbreviation to number
    const months = {
      'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
      'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = months[monthStr.toUpperCase()];
    const fullYear = 2000 + parseInt(year);

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: parseFloat(strike),
      expirationDate: `${fullYear}-${month}-${day.padStart(2, '0')}`,
      optionType: type.toLowerCase(),
      contractSize: 100
    };
  }

  // Compact IBKR options format: "DIA10OCT25466PUT" (underlying + date + strike + type, no spaces)
  const compactReadableOptionMatch = symbolNoSpaces.match(/^([A-Z]+)(\d{1,2})([A-Z]{3})(\d{2})(\d+(?:\.\d+)?)(PUT|CALL)$/i);
  if (compactReadableOptionMatch) {
    const [, underlying, day, monthStr, year, strike, type] = compactReadableOptionMatch;

    // Convert month abbreviation to number
    const months = {
      'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
      'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = months[monthStr.toUpperCase()];
    const fullYear = 2000 + parseInt(year);

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: parseFloat(strike),
      expirationDate: `${fullYear}-${month}-${day.padStart(2, '0')}`,
      optionType: type.toLowerCase(),
      contractSize: 100
    };
  }

  // IBKR Options format: "SEDG  250801P00025000" or "AMD   251010C00240000" (underlying + spaces + YYMMDD + C/P + strike)
  // This format has the underlying padded with spaces, then date, call/put indicator, and strike*1000
  // Try with spaces first (original format), then without spaces (e.g., "Cl 251024C00322500" -> "Cl251024C00322500")
  const ibkrOptionMatch = normalizedSymbol.match(/^([A-Z]+)\s+(\d{6})([CP])(\d{8})$/) ||
                          symbolNoSpaces.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (ibkrOptionMatch) {
    const [, underlying, expiry, type, strikeStr] = ibkrOptionMatch;
    const year = 2000 + parseInt(expiry.substr(0, 2));
    const month = parseInt(expiry.substr(2, 2));
    const day = parseInt(expiry.substr(4, 2));
    const strike = parseInt(strikeStr) / 1000;

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: strike,
      expirationDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      optionType: type.toLowerCase() === 'c' ? 'call' : 'put',
      contractSize: 100
    };
  }

  // Standard compact options format: "AAPL230120C00150000" (6-char underlying + YYMMDD + C/P + 8-digit strike)
  // Also handles format with spaces like "Cl 251024C00322500" by using symbolNoSpaces
  const compactOptionMatch = symbolNoSpaces.match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
  if (compactOptionMatch) {
    const [, underlying, expiry, type, strikeStr] = compactOptionMatch;
    const year = 2000 + parseInt(expiry.substr(0, 2));
    const month = parseInt(expiry.substr(2, 2));
    const day = parseInt(expiry.substr(4, 2));
    const strike = parseInt(strikeStr) / 1000;

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: strike,
      expirationDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      optionType: type.toLowerCase() === 'c' ? 'call' : 'put',
      contractSize: 100
    };
  }

  // Futures format detection: "ESM4", "NQU24", "CLZ23", "NYMEX_MINI:QG1!", etc.
  // Base symbol may contain digits (e.g. M2K = Micro Russell 2000), so allow
  // alphanumerics after a required leading letter rather than letters only.
  const futuresPatterns = [
    /^([A-Z][A-Z0-9]{0,2})([FGHJKMNQUVXZ])(\d{1,2})$/,  // Standard: ESM4, NQU24, CLZ23, M2KM6
    // TradingView futures: NYMEX_MINI:QG1!, CME:ESH2026. The lookahead requires the
    // contract part to contain a digit or end with "!" so plain exchange-prefixed
    // stock tickers (e.g. NASDAQ:HUBC, NASDAQ:LASE) are NOT misclassified as futures.
    /^([A-Z_]+):(?=[A-Z0-9]*\d|[A-Z0-9]+!)([A-Z0-9]+)!?$/,
    /^\/([A-Z][A-Z0-9]{0,2})([FGHJKMNQUVXZ])(\d{2})$/,   // Slash notation: /ESM24
    /^F\.[A-Z]{2,}\.([A-Z][A-Z0-9]{0,2})([FGHJKMNQUVXZ])(\d{1,2})$/  // AvaTrade: F.US.MESM26
  ];

  for (const pattern of futuresPatterns) {
    const match = normalizedSymbol.match(pattern);
    if (match) {
      let underlying, monthCode, year;

      if (pattern.source.includes(':')) {
        // TradingView format
        const [, , contractSymbol] = match;
        const standardTvMatch = contractSymbol.match(/^([A-Z][A-Z0-9]*?)([FGHJKMNQUVXZ])(\d{1,4})$/);
        const continuousTvMatch = contractSymbol.match(/^([A-Z]+)\d+$/);

        if (standardTvMatch) {
          [, underlying, monthCode, year] = standardTvMatch;
          year = parseInt(year, 10);
          if (year < 10) {
            const currentYear = new Date().getFullYear();
            const currentDecade = Math.floor(currentYear / 10) * 10;
            year = currentDecade + year;
          } else if (year < 100) {
            year += 2000;
          }
        } else if (continuousTvMatch) {
          underlying = continuousTvMatch[1];
          monthCode = null;
          year = 9999;
        } else {
          const tvMatch = contractSymbol.match(/([A-Z]+)(\d+)/);
          if (tvMatch) {
            underlying = tvMatch[1];
            year = parseInt(tvMatch[2], 10);
            if (year < 100) year += 2000;
          }
        }
      } else {
        [, underlying, monthCode, year] = match;
        year = parseInt(year);
        if (year < 10) {
          // Single digit year: interpret as last digit of current decade (e.g., 5 = 2025, 9 = 2029, 0 = 2020)
          const currentYear = new Date().getFullYear();
          const currentDecade = Math.floor(currentYear / 10) * 10;
          year = currentDecade + year;
        } else if (year < 100) {
          // Two digit year: use standard logic (00-49 = 2000s, 50-99 = 1900s)
          year += year < 50 ? 2000 : 1900;
        }
      }

      // If the symbol matched a futures-shaped pattern but we couldn't extract a
      // product code (e.g. an exchange-prefixed stock ticker that slipped through),
      // do not claim it's a future. A future with a null underlying/month/year would
      // violate the check_futures_fields DB constraint and fail the whole import.
      if (!underlying) {
        continue;
      }

      const monthCodes = { F: '01', G: '02', H: '03', J: '04', K: '05', M: '06', N: '07', Q: '08', U: '09', V: '10', X: '11', Z: '12' };
      const month = monthCode ? monthCodes[monthCode] : (year === 9999 ? 'CONT' : null);

      return {
        instrumentType: 'future',
        underlyingAsset: underlying,
        contractMonth: month,
        contractYear: year || null,
        pointValue: getFuturesPointValue(underlying)
      };
    }
  }

  // NinjaTrader-style futures display names: underlying + space + month + year.
  // NinjaTrader 8 exports the instrument as e.g. "ES JUN26" (3-letter month
  // abbreviation) or "ES 06-26" (numeric month, dash, year), neither of which
  // matches the compact "ESM26" patterns above. Without this, "ES JUN26" falls
  // through to 'stock' and a 1-point move is valued at $1 instead of $50.
  // The underlying may contain digits (e.g. "M2K"), so allow a leading letter
  // then alphanumerics. These run after the option patterns above, which also
  // begin with "<letters> <space>" but always carry a strike + PUT/CALL.
  const ninjaMonthAbbr = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
  };
  const ninjaNamedMonth = normalizedSymbol.match(/^([A-Z][A-Z0-9]{0,3})\s+([A-Z]{3})\s?(\d{2})$/);
  const ninjaNumericMonth = normalizedSymbol.match(/^([A-Z][A-Z0-9]{0,3})\s+(0[1-9]|1[0-2])-(\d{2})$/);
  if (ninjaNamedMonth || ninjaNumericMonth) {
    const underlying = (ninjaNamedMonth || ninjaNumericMonth)[1];
    const month = ninjaNamedMonth
      ? ninjaMonthAbbr[ninjaNamedMonth[2]]
      : ninjaNumericMonth[2];
    const yearStr = (ninjaNamedMonth || ninjaNumericMonth)[3];
    // Only treat as a future if the month resolved to a valid code (guards
    // against random 3-letter words that aren't month abbreviations).
    if (month) {
      return {
        instrumentType: 'future',
        underlyingAsset: underlying,
        contractMonth: month,
        contractYear: 2000 + parseInt(yearStr, 10),
        pointValue: getFuturesPointValue(underlying)
      };
    }
  }

  return { instrumentType: 'stock' };
}

// getFuturesPointValue is now imported from futuresUtils

// PostgreSQL 16 compatible numeric parsing
function parseNumeric(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') return defaultValue;

  let cleanValue = value.toString().trim().replace(/\$/g, '');
  if (cleanValue === '') return defaultValue;

  // European decimal comma (e.g. NinjaTrader 7200,75) — not a thousands separator
  if (/^-?\d{1,3}(\.\d{3})*,\d{1,2}$/.test(cleanValue) || /^-?\d+,\d{1,2}$/.test(cleanValue)) {
    cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
  } else {
    cleanValue = cleanValue.replace(/,/g, '');
  }

  // Handle accounting-style negative: (123.45) -> -123.45
  const parenMatch = cleanValue.match(/^\((.+)\)$/);
  if (parenMatch) {
    cleanValue = '-' + parenMatch[1];
  }

  const parsed = parseFloat(cleanValue);
  if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;

  // PostgreSQL 16 has stricter limits on numeric precision
  if (Math.abs(parsed) > 1e15) return defaultValue;

  return parsed;
}

function parseInteger(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') return defaultValue;
  
  const cleanValue = value.toString().trim().replace(/[,]/g, '');
  if (cleanValue === '') return defaultValue;
  
  const parsed = parseInt(cleanValue);
  if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;
  
  // PostgreSQL 16 integer limits
  if (parsed < -2147483648 || parsed > 2147483647) return defaultValue;
  
  return Math.abs(parsed); // Ensure positive for quantities
}

function isValidTrade(trade) {
  return trade.symbol &&
         trade.tradeDate &&
         trade.entryTime &&
         trade.entryPrice > 0 &&
         trade.quantity > 0;
}

module.exports = {
  parseDate,
  parseTimeOnly,
  extractDateFromFilename,
  parseDateTime,
  hasExplicitTimezone,
  compareCanonicalDateTimes,
  getExecutionTimeBounds,
  parseSide,
  POSITION_CLOSE_TOLERANCE,
  normalizePositionQuantity,
  parseTradervueSide,
  cleanString,
  parseTagList,
  normalizeRecord,
  parseInstrumentData,
  parseNumeric,
  parseInteger,
  isValidTrade
};
