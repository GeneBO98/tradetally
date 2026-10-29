jest.mock('../../src/services/aiSessionService', () => ({}));
jest.mock('../../src/services/aiCreditService', () => ({}));
jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(async () => ({}))
}));
jest.mock('../../src/services/aiTraderContext', () => ({
  MAX_MEMORY_NOTES: 20,
  MAX_MEMORY_NOTE_CHARS: 300,
  invalidate: jest.fn()
}));

const User = require('../../src/models/User');
const AITraderContext = require('../../src/services/aiTraderContext');
const aiController = require('../../src/controllers/ai.controller');

function createRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('aiController.addMemoryNote', () => {
  beforeEach(() => jest.clearAllMocks());

  test('appends a normalized note and invalidates the dossier cache', async () => {
    User.getSettings.mockResolvedValueOnce({ ai_memory_notes: ['keep size flat'] });
    const res = createRes();
    await aiController.addMemoryNote({ user: { id: 'u1' }, body: { note: '  I  overtrade after   green days ' } }, res, jest.fn());

    expect(User.updateSettings).toHaveBeenCalledWith('u1', { aiMemoryNotes: ['keep size flat', 'I overtrade after green days'] });
    expect(AITraderContext.invalidate).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, notes: ['keep size flat', 'I overtrade after green days'], added: true });
  });

  test('is idempotent for a note that already exists', async () => {
    User.getSettings.mockResolvedValueOnce({ ai_memory_notes: ['Keep size flat'] });
    const res = createRes();
    await aiController.addMemoryNote({ user: { id: 'u1' }, body: { note: 'keep size flat' } }, res, jest.fn());
    expect(User.updateSettings).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, notes: ['Keep size flat'], added: false });
  });

  test('refuses when the list is full or the note is malformed', async () => {
    User.getSettings.mockResolvedValueOnce({ ai_memory_notes: Array.from({ length: 20 }, (_, i) => `note ${i}`) });
    let res = createRes();
    await aiController.addMemoryNote({ user: { id: 'u1' }, body: { note: 'one more' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);

    res = createRes();
    await aiController.addMemoryNote({ user: { id: 'u1' }, body: { note: 'x' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);

    res = createRes();
    await aiController.addMemoryNote({ user: { id: 'u1' }, body: { note: 'y'.repeat(301) } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.updateSettings).not.toHaveBeenCalled();
  });
});
