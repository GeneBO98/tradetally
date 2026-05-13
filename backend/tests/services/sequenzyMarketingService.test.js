jest.mock('axios');

const axios = require('axios');
const service = require('../../src/services/sequenzyMarketingService');

describe('sequenzyMarketingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SEQUENZY_API_KEY = 'seq_test_key';
    process.env.SEQUENZY_API_BASE_URL = 'https://api.sequenzy.com';
  });

  test('posts subscriber events to Sequenzy', async () => {
    axios.post.mockResolvedValue({ data: { success: true, event: { id: 'evt_1' } } });

    const result = await service.triggerEvent({
      email: 'user@example.com',
      event: service.EVENTS.AT_RISK_FOLLOWUP,
      properties: {
        headline: 'Hello'
      }
    });

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.sequenzy.com/api/v1/subscribers/events',
      {
        email: 'user@example.com',
        event: service.EVENTS.AT_RISK_FOLLOWUP,
        properties: {
          headline: 'Hello'
        },
        customAttributes: undefined
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer seq_test_key'
        })
      })
    );
    expect(result).toEqual({ success: true, event: { id: 'evt_1' } });
  });
});
