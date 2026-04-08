jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const twentySyncService = require('../../src/services/twentySyncService');

describe('TwentySyncService upsertPerson', () => {
  const userData = {
    id: 'user-1',
    email: 'TestUser@Example.com',
    username: 'testuser',
    full_name: 'Test User',
    created_at: '2026-04-06T00:00:00.000Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates an existing mapped person without creating a new record', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ twenty_person_id: 'person-123' }] });
    const updateSpy = jest.spyOn(twentySyncService, 'updatePerson').mockResolvedValue({ id: 'person-123' });
    const createSpy = jest.spyOn(twentySyncService, 'createPerson').mockResolvedValue({ id: 'person-new' });

    const result = await twentySyncService.upsertPerson(userData);

    expect(updateSpy).toHaveBeenCalledWith('person-123', userData);
    expect(createSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'person-123' });
  });

  it('finds an existing person by email, stores the mapping, and updates it', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    jest.spyOn(twentySyncService, 'findPersonByEmail').mockResolvedValue({ id: 'person-456' });
    const updateSpy = jest.spyOn(twentySyncService, 'updatePerson').mockResolvedValue({ id: 'person-456' });
    const createSpy = jest.spyOn(twentySyncService, 'createPerson').mockResolvedValue({ id: 'person-new' });

    const result = await twentySyncService.upsertPerson(userData);

    expect(updateSpy).toHaveBeenCalledWith('person-456', userData);
    expect(createSpy).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO twenty_person_sync_map'),
      ['user-1', 'person-456', 'testuser@example.com']
    );
    expect(result).toEqual({ id: 'person-456' });
  });

  it('creates a person once, then stores the mapping for future updates', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    jest.spyOn(twentySyncService, 'findPersonByEmail').mockResolvedValue(null);
    const createSpy = jest.spyOn(twentySyncService, 'createPerson').mockResolvedValue({ id: 'person-789' });
    const updateSpy = jest.spyOn(twentySyncService, 'updatePerson').mockResolvedValue({ id: 'person-789' });

    const result = await twentySyncService.upsertPerson(userData);

    expect(createSpy).toHaveBeenCalledWith(userData);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO twenty_person_sync_map'),
      ['user-1', 'person-789', 'testuser@example.com']
    );
    expect(result).toEqual({ id: 'person-789' });
  });
});
