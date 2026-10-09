const { EventEmitter } = require('events');

jest.mock('https', () => ({
  request: jest.fn()
}));

const originalApiKey = process.env.DATABENTO_API_KEY;
process.env.DATABENTO_API_KEY = 'db-test-key';

const https = require('https');
const databento = require('../../src/utils/databento');

describe('Databento HTTP client', () => {
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.DATABENTO_API_KEY;
    else process.env.DATABENTO_API_KEY = originalApiKey;
  });

  beforeEach(() => {
    https.request.mockReset();
  });

  test('posts range parameters as form data', async () => {
    let requestOptions;
    let request;

    https.request.mockImplementation((options, callback) => {
      requestOptions = options;
      const response = new EventEmitter();
      response.statusCode = 200;

      request = new EventEmitter();
      request.write = jest.fn();
      request.end = jest.fn(() => {
        callback(response);
        response.emit('data', '{"open":1000000000}\n');
        response.emit('end');
      });
      return request;
    });

    await databento.makeRequest('timeseries.get_range', {
      dataset: 'GLBX.MDP3',
      symbols: 'MES.c.0',
      schema: 'ohlcv-1m',
      stype_in: 'continuous',
      encoding: 'json'
    });

    expect(requestOptions).toMatchObject({
      hostname: 'hist.databento.com',
      path: '/v0/timeseries.get_range',
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/x-www-form-urlencoded'
      })
    });
    expect(request.write).toHaveBeenCalledWith(
      'dataset=GLBX.MDP3&symbols=MES.c.0&schema=ohlcv-1m&stype_in=continuous&encoding=json'
    );
  });
});
