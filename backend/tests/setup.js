// Silence console.log and console.warn during tests
// The CSV parsers are extremely chatty with debug output
const originalLog = console.log;
const originalWarn = console.warn;

beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.log = originalLog;
  console.warn = originalWarn;
});
