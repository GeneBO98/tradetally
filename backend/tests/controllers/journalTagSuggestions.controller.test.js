jest.mock('../../src/services/journalTagSuggestionService', () => ({ suggest: jest.fn() }));
jest.mock('../../src/services/journalTagFeedbackService', () => ({ createRun: jest.fn().mockResolvedValue(null), record: jest.fn() }));
const service = require('../../src/services/journalTagSuggestionService');
const { suggestTags } = require('../../src/controllers/journalTagSuggestions.controller');
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
test('validates text before calling a provider', async () => {
  const response = res();
  await suggestTags({ body: { text: 'a'.repeat(12001) }, user: { id: 'owner' } }, response);
  expect(response.status).toHaveBeenCalledWith(400);
  expect(service.suggest).not.toHaveBeenCalled();
});
test('uses authenticated owner and never writes tags automatically', async () => {
  service.suggest.mockResolvedValue({ decisions: [] });
  const response = res();
  await suggestTags({ body: { text: 'My own notes', userId: 'another-user' }, user: { id: 'owner' } }, response);
  expect(service.suggest).toHaveBeenCalledWith('owner', 'My own notes');
  expect(response.json).toHaveBeenCalledWith({ decisions: [], requestId: null });
});
test('provider errors do not expose credentials or journal text', async () => {
  service.suggest.mockRejectedValue(new Error('Bearer secret-key private notes'));
  const response = res();
  await suggestTags({ body: { text: 'My own notes' }, user: { id: 'owner' } }, response);
  expect(response.status).toHaveBeenCalledWith(503);
  expect(JSON.stringify(response.json.mock.calls)).not.toContain('secret-key');
});
