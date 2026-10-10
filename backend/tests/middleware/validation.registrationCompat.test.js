const { validate, schemas } = require('../../src/middleware/validation');

function createMockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

function runRegistrationValidation(body, userAgent = 'TradeTally-iOS/1.0') {
  const middleware = validate(schemas.register, { mobileRegistrationCompat: true });
  const req = {
    originalUrl: '/api/auth/register',
    body,
    headers: { 'user-agent': userAgent }
  };
  const res = createMockRes();
  const next = jest.fn();

  middleware(req, res, next);

  return { req, res, next };
}

describe('mobile registration compatibility', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('drops an invalid hidden iOS username so the controller can generate one', () => {
    const { req, next } = runRegistrationValidation({
      email: 'mobile@example.com',
      password: 'password123',
      fullName: 'Mobile Trader',
      username: 'Mobile Trader'
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({
      email: 'mobile@example.com',
      password: 'password123',
      fullName: 'Mobile Trader',
      marketing_consent: false
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[REGISTER] Ignoring invalid auto-generated username from TradeTally iOS client'
    );
  });

  test('combines legacy iOS first and last name fields into fullName', () => {
    const { req, next } = runRegistrationValidation({
      email: 'mobile@example.com',
      password: 'password123',
      firstName: 'Mobile',
      lastName: 'Trader'
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.fullName).toBe('Mobile Trader');
    expect(req.body).not.toHaveProperty('firstName');
    expect(req.body).not.toHaveProperty('lastName');
  });

  test('retains a valid hidden iOS username', () => {
    const { req, next } = runRegistrationValidation({
      email: 'mobile@example.com',
      password: 'password123',
      username: 'mobile_trader'
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.username).toBe('mobile_trader');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('keeps strict username validation for non-iOS clients', () => {
    const { res, next } = runRegistrationValidation({
      email: 'web@example.com',
      password: 'password123',
      username: 'Web Trader'
    }, 'Mozilla/5.0');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Validation Error',
      fields: expect.arrayContaining([
        expect.objectContaining({
          field: 'username',
          type: 'string.pattern.base'
        })
      ])
    }));
  });
});
