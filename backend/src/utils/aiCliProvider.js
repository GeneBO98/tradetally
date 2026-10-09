const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_STDOUT_BYTES = 2 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;

const PROVIDERS = Object.freeze({
  codex_cli: {
    label: 'Codex CLI',
    executableEnv: 'CODEX_CLI_PATH',
    defaultExecutable: 'codex'
  },
  claude_cli: {
    label: 'Claude CLI',
    executableEnv: 'CLAUDE_CLI_PATH',
    defaultExecutable: 'claude'
  }
});

function getTimeoutMs() {
  const configured = Number.parseInt(process.env.AI_CLI_TIMEOUT_MS, 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

function getProviderConfig(provider) {
  const config = PROVIDERS[provider];
  if (!config) {
    throw new Error(`Unsupported AI CLI provider: ${provider}`);
  }
  return config;
}

function buildCliInvocation(provider, modelName, workingDirectory) {
  const config = getProviderConfig(provider);
  const executable = process.env[config.executableEnv] || config.defaultExecutable;
  const model = String(modelName || '').trim();

  if (provider === 'codex_cli') {
    return {
      executable,
      args: [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--ignore-user-config',
        '--ignore-rules',
        '--color',
        'never',
        '--cd',
        workingDirectory,
        ...(model ? ['--model', model] : []),
        '-'
      ]
    };
  }

  return {
    executable,
    args: [
      '--print',
      '--safe-mode',
      '--tools',
      '',
      '--no-session-persistence',
      '--output-format',
      'text',
      ...(model ? ['--model', model] : [])
    ]
  };
}

function terminateChild(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  const forceKillTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, 1000);
  forceKillTimer.unref?.();
}

function formatSpawnError(error, config) {
  if (error?.code === 'ENOENT') {
    return new Error(
      `${config.label} executable was not found on the TradeTally backend host. ` +
      `Install and authenticate it, or set ${config.executableEnv} to its executable path.`
    );
  }
  return new Error(`${config.label} failed to start: ${error?.message || 'Unknown error'}`);
}

function runCliCommand(provider, executable, args, prompt, workingDirectory) {
  const config = getProviderConfig(provider);

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    let settled = false;

    const child = spawn(executable, args, {
      cwd: workingDirectory,
      env: process.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      terminateChild(child);
    }, getTimeoutMs());
    timeout.unref?.();

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        outputExceeded = true;
        terminateChild(child);
        return;
      }
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', chunk => {
      if (stderrBytes >= MAX_STDERR_BYTES) return;
      const remaining = MAX_STDERR_BYTES - stderrBytes;
      const clipped = chunk.subarray(0, remaining);
      stderrBytes += clipped.length;
      stderr += clipped.toString('utf8');
    });

    child.on('error', error => {
      finish(() => reject(formatSpawnError(error, config)));
    });

    child.on('close', code => {
      finish(() => {
        if (timedOut) {
          reject(new Error(`${config.label} timed out after ${getTimeoutMs()}ms.`));
          return;
        }
        if (outputExceeded) {
          reject(new Error(`${config.label} returned more than ${MAX_STDOUT_BYTES} bytes.`));
          return;
        }
        if (code !== 0) {
          const details = stderr.trim().slice(0, 1000);
          reject(new Error(
            `${config.label} exited with code ${code}${details ? `: ${details}` : '.'}`
          ));
          return;
        }

        const response = stdout.trim();
        if (!response) {
          reject(new Error(`${config.label} returned an empty response.`));
          return;
        }
        resolve(response);
      });
    });

    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE') {
        finish(() => reject(new Error(`${config.label} input failed: ${error.message}`)));
      }
    });
    child.stdin.end(prompt);
  });
}

async function generateResponse(prompt, settings = {}) {
  const provider = settings.provider;
  const config = getProviderConfig(provider);
  const promptText = String(prompt || '').trim();
  if (!promptText) {
    throw new Error(`${config.label} prompt cannot be empty.`);
  }

  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tradetally-ai-'));
  const invocation = buildCliInvocation(provider, settings.modelName, workingDirectory);
  const isolatedPrompt = [
    'You are running as a text-only analysis provider for TradeTally.',
    'Do not inspect files, run commands, browse, or use tools. Analyze only the content below and return only the requested answer.',
    '',
    promptText
  ].join('\n');

  console.log(`[AI_CLI] Running ${config.label}${settings.modelName ? ` with model ${settings.modelName}` : ''}`);

  try {
    return await runCliCommand(
      provider,
      invocation.executable,
      invocation.args,
      isolatedPrompt,
      workingDirectory
    );
  } finally {
    await fs.rm(workingDirectory, { recursive: true, force: true }).catch(error => {
      console.warn(`[AI_CLI] Could not remove temporary working directory: ${error.message}`);
    });
  }
}

module.exports = {
  buildCliInvocation,
  generateResponse,
  runCliCommand
};
