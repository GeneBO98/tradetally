jest.mock('../../src/config/database', () => ({ connect: jest.fn(), query: jest.fn() }));

const db = require('../../src/config/database');
const Playbook = require('../../src/models/Playbook');

describe('playbook checklist edits', () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'item-1' }] }), release: jest.fn() };
    db.connect.mockResolvedValue(client);
    db.query.mockResolvedValue({ rows: [{ id: 'playbook-1' }] });
  });

  test('preserves item identities when renaming, changing requirements, and reordering', async () => {
    await Playbook.update('playbook-1', 'user-1', {
      name: 'My plan',
      checklistItems: [
        { id: 'item-2', label: 'Renamed', weight: 2, isRequired: true },
        { id: 'item-1', label: 'Entry', weight: 1 },
        { label: 'New rule' }
      ]
    });

    const deletes = client.query.mock.calls.filter(([sql]) => sql.includes('DELETE FROM playbook_checklist_items'));
    expect(deletes).toEqual([[expect.stringContaining('NOT (id = ANY($2::uuid[]))'),
      ['playbook-1', ['item-2', 'item-1']]]]);
    const updates = client.query.mock.calls.filter(([sql]) => sql.includes('UPDATE playbook_checklist_items'));
    expect(updates.map(([, params]) => params)).toEqual([
      ['item-2', 'playbook-1', 'Renamed', 0, 2, true],
      ['item-1', 'playbook-1', 'Entry', 1, 1, false]
    ]);
    const inserts = client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO playbook_checklist_items'));
    expect(inserts.map(([, params]) => params)).toEqual([['playbook-1', 'New rule', 2, 1, false]]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('rolls back the entire edit if an item belongs to another playbook', async () => {
    client.query.mockImplementation(async sql => ({
      rows: sql.includes('UPDATE playbook_checklist_items') ? [] : [{ id: 'playbook-1' }]
    }));
    await expect(Playbook.update('playbook-1', 'user-1', {
      name: 'My plan', checklistItems: [{ id: 'foreign-item', label: 'Other rule' }]
    })).rejects.toMatchObject({ status: 400 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});
