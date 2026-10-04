const Joi = require('joi');
const { validate, validatePayload, schemas } = require('../../src/middleware/validation');

describe('standalone payload validation', () => {
  test('returns the same normalized trade update as middleware without mutating the input', () => {
    const body = { stopLoss: '95.50', takeProfit: '120' };
    const req = { body, headers: {} };
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const result = validatePayload(schemas.updateTrade, body);
    validate(schemas.updateTrade)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(result.fields).toBeUndefined();
    expect(result.value).toEqual(req.body);
    expect(result.value).toMatchObject({ stopLoss: 95.5, takeProfit: 120 });
    expect(body).toEqual({ stopLoss: '95.50', takeProfit: '120' });
  });

  test('returns field errors for invalid bulk items without accepting a value', () => {
    const result = validatePayload(schemas.trade, { symbol: '' });

    expect(result.value).toBeUndefined();
    expect(result.fields).toContainEqual({
      field: 'symbol',
      message: expect.any(String),
      type: 'string.empty'
    });
  });

  test.each([
    [{ stop_loss: '95' }, 95],
    [{ stopLoss: 90, stop_loss: 95 }, 90]
  ])('normalizes snake_case aliases and preserves explicit camelCase values: %j', (body, expected) => {
    const schema = Joi.object({
      stopLoss: Joi.number().required(),
      stop_loss: Joi.number()
    });

    const result = validatePayload(schema, body);

    expect(result.fields).toBeUndefined();
    expect(result.value.stopLoss).toBe(expected);
  });
});
