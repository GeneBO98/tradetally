jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/timezone', () => ({
  getUserLocalDate: jest.fn().mockResolvedValue('2026-08-03')
}));

const db = require('../../src/config/database');
const Diary = require('../../src/models/Diary');

describe('Diary multiple entries per date', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('always inserts a new entry instead of upserting by date and type', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1', entry_date: '2026-08-03' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'entry-2', entry_date: '2026-08-03' }] });

    const entryData = {
      entryDate: '2026-08-03',
      entryType: 'diary',
      title: 'Weekly review'
    };

    const first = await Diary.create('user-1', entryData);
    const second = await Diary.create('user-1', { ...entryData, title: 'Monthly review' });

    expect(first.id).toBe('entry-1');
    expect(second.id).toBe('entry-2');
    expect(db.query).toHaveBeenCalledTimes(2);
    for (const [sql] of db.query.mock.calls) {
      expect(sql).toContain('INSERT INTO diary_entries');
      expect(sql).not.toContain('ON CONFLICT');
      expect(sql).not.toContain('DO UPDATE');
    }
  });

  test('returns every entry for the user date, newest first', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 'entry-2', title: 'Monthly review' },
        { id: 'entry-1', title: 'Weekly review' }
      ]
    });

    const entries = await Diary.findAllByDate('user-1', '2026-08-03', 'diary');

    expect(entries).toHaveLength(2);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY de.created_at DESC, de.id DESC'),
      ['user-1', '2026-08-03', 'diary']
    );
  });

  test('allows an existing entry date to be changed by ID', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'entry-1', entry_date: '2026-08-04' }] });

    await Diary.update('entry-1', 'user-1', { entryDate: '2026-08-04' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('entry_date = $1'),
      ['2026-08-04', 'entry-1', 'user-1']
    );
  });
});
