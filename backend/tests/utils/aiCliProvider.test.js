jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const {
  buildCliInvocation,
  runCliCommand
} = require('../../src/utils/aiCliProvider');

function createChildProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = jest.fn();
  child.kill = jest.fn();
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

describe('AI CLI provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CODEX_CLI_PATH;
    delete process.env.CLAUDE_CLI_PATH;
  });

  test('builds an isolated non-interactive Codex invocation', () => {
    const invocation = buildCliInvocation('codex_cli', 'gpt-test', '/tmp/tradetally-ai-test');

    expect(invocation.executable).toBe('codex');
    expect(invocation.args).toEqual(expect.arrayContaining([
      'exec',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--ignore-user-config',
      '--ignore-rules',
      '--cd',
      '/tmp/tradetally-ai-test',
      '--model',
      'gpt-test',
      '-'
    ]));
  });

  test('builds a tool-free non-interactive Claude invocation', () => {
    process.env.CLAUDE_CLI_PATH = '/opt/claude';
    const invocation = buildCliInvocation('claude_cli', '', '/tmp/tradetally-ai-test');

    expect(invocation.executable).toBe('/opt/claude');
    expect(invocation.args).toEqual([
      '--print',
      '--safe-mode',
      '--tools',
      '',
      '--no-session-persistence',
      '--output-format',
      'text'
    ]);
  });

  test('passes the prompt on stdin and returns stdout', async () => {
    const child = createChildProcess();
    spawn.mockReturnValue(child);

    const responsePromise = runCliCommand(
      'claude_cli',
      'claude',
      ['--print'],
      'Analyze this trade',
      '/tmp'
    );

    expect(spawn).toHaveBeenCalledWith('claude', ['--print'], expect.objectContaining({
      cwd: '/tmp',
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    }));
    expect(child.stdin.end).toHaveBeenCalledWith('Analyze this trade');

    child.stdout.emit('data', Buffer.from('Focused analysis\n'));
    child.emit('close', 0);

    await expect(responsePromise).resolves.toBe('Focused analysis');
  });

  test('reports a missing executable with setup guidance', async () => {
    const child = createChildProcess();
    spawn.mockReturnValue(child);

    const responsePromise = runCliCommand('codex_cli', 'codex', [], 'Prompt', '/tmp');
    const error = new Error('spawn codex ENOENT');
    error.code = 'ENOENT';
    child.emit('error', error);

    await expect(responsePromise).rejects.toThrow('set CODEX_CLI_PATH');
  });
});
