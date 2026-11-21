import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const INSTALL_STEPS = [
  'No JDK was found. Coding and debugging rounds need a JDK; design rounds run without one.',
  'Install Eclipse Temurin 17 (LTS) or 21 (LTS): https://adoptium.net/temurin/releases/',
  'Or on Windows run: winget install --id EclipseAdoptium.Temurin.21.JDK -e',
  'Set JAVA_HOME to the installed JDK folder and add its bin directory to PATH.',
  'Open a new terminal and check that both `java -version` and `javac -version` work.',
  'Restart the simulator with: node interview-sim/server.mjs',
];

const ANNOTATION = '@(?!interface\\b)[A-Za-z_$][\\w$.]*(?:\\([^)]*\\))?';
const MODIFIER_LIST = `(?:(?:public|protected|private|abstract|final|static|sealed|non-sealed|strictfp|${ANNOTATION})\\s+)*`;
const TYPE_KEYWORD = '(?:@interface|class|interface|enum|record)';
const TYPE_NAME = '([A-Z_$][\\w$]*)';
const DECLARATION_TAIL = '(?:[<({]|extends\\b|implements\\b|permits\\b)';
const DECLARATION_RE = new RegExp(
  `(?:^|\\n)[ \\t]*${MODIFIER_LIST}${TYPE_KEYWORD}\\s+${TYPE_NAME}\\s*${DECLARATION_TAIL}`,
);
const PUBLIC_DECLARATION_RE = new RegExp(
  `(?:^|\\n)[ \\t]*(?:${ANNOTATION}\\s+)*public\\s+${MODIFIER_LIST}${TYPE_KEYWORD}\\s+${TYPE_NAME}\\s*${DECLARATION_TAIL}`,
);

let cached = null;

export function hasJavaTypeDeclaration(source) {
  return DECLARATION_RE.test(String(source || ''));
}

export function javaFileNameFor(source, fallback) {
  const match = PUBLIC_DECLARATION_RE.exec(String(source || ''));
  if (match) return `${match[1]}.java`;
  const name = String(fallback || '');
  return name || 'Sketch.java';
}

function listDirSafe(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function javacIn(home) {
  if (!home) return null;
  const names = process.platform === 'win32'
    ? ['javac.exe', 'javac.cmd', 'javac']
    : ['javac'];
  for (const name of names) {
    const candidate = path.join(home, 'bin', name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function javaIn(home) {
  if (!home) return null;
  const names = process.platform === 'win32'
    ? ['java.exe', 'java']
    : ['java'];
  for (const name of names) {
    const candidate = path.join(home, 'bin', name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function versionOf(javacPath) {
  try {
    const out = spawnSync(javacPath, ['-version'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
    });
    const text = `${out.stdout || ''}\n${out.stderr || ''}`;
    const match = text.match(/javac\s+([0-9][^\s]*)/i);
    return match ? match[1] : (text.trim().split(/\r?\n/)[0] || 'unknown');
  } catch {
    return 'unknown';
  }
}

function describe(home, source, javacPath) {
  const javaPath = javaIn(home);
  if (!javacPath || !javaPath) return null;
  return {
    available: true,
    home,
    javac: javacPath,
    java: javaPath,
    version: versionOf(javacPath),
    source,
    installSteps: [],
  };
}

function findJbrs(root, depth, found, budget) {
  if (!root || depth < 0 || budget.count > 600) return;
  for (const entry of listDirSafe(root)) {
    budget.count += 1;
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    if (entry.name.toLowerCase() === 'jbr') {
      found.push(full);
    } else if (depth > 0) {
      findJbrs(full, depth - 1, found, budget);
    }
  }
}

function childHomes(root) {
  const homes = [];
  for (const entry of listDirSafe(root)) {
    if (entry.isDirectory()) homes.push(path.join(root, entry.name));
  }
  return homes;
}

function knownJdkHomes() {
  const homes = [];
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || '';

  homes.push(path.join(programFiles, 'Android', 'Android Studio', 'jbr'));

  const budget = { count: 0 };
  const jbrRoots = [
    path.join(programFiles, 'JetBrains'),
    path.join(programFiles, 'Android', 'Android Studio'),
    path.join(localAppData, 'JetBrains'),
    path.join(localAppData, 'Programs', 'JetBrains'),
    path.join(localAppData, 'JetBrains', 'Toolbox', 'apps'),
  ].filter(Boolean);

  for (const root of jbrRoots) {
    const found = [];
    findJbrs(root, 4, found, budget);
    homes.push(...found);
  }

  for (const root of [
    path.join(programFiles, 'Eclipse Adoptium'),
    path.join(programFiles, 'Java'),
    path.join(programFilesX86, 'Eclipse Adoptium'),
    path.join(localAppData, 'Programs', 'Eclipse Adoptium'),
    path.join(localAppData, 'Programs', 'Java'),
  ].filter(Boolean)) {
    homes.push(...childHomes(root));
  }

  return [...new Set(homes)];
}

export function detectJdk({ refresh = false } = {}) {
  if (cached && !refresh) return cached;

  const missing = {
    available: false,
    home: null,
    javac: null,
    java: null,
    version: null,
    source: null,
    installSteps: INSTALL_STEPS,
  };

  const javaHome = process.env.JAVA_HOME && process.env.JAVA_HOME.trim();
  if (javaHome) {
    const javacPath = javacIn(javaHome);
    const info = describe(javaHome, 'JAVA_HOME', javacPath);
    if (info) {
      cached = info;
      return info;
    }
  }

  const pathJavac = process.platform === 'win32' ? 'javac.exe' : 'javac';
  const pathProbe = spawnSync(pathJavac, ['-version'], {
    encoding: 'utf8',
    timeout: 8000,
    windowsHide: true,
  });
  if (!pathProbe.error && pathProbe.status === 0) {
    let resolved = null;
    const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['javac'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
    });
    const first = (where.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (first) resolved = path.dirname(path.dirname(first));
    if (!resolved) {
      cached = {
        available: true,
        home: null,
        javac: pathJavac,
        java: process.platform === 'win32' ? 'java.exe' : 'java',
        version: versionOf(pathJavac),
        source: 'PATH',
        installSteps: [],
      };
      return cached;
    }
    const info = describe(resolved, 'PATH', javacIn(resolved) || pathJavac);
    if (info) {
      cached = info;
      return info;
    }
  }

  for (const home of knownJdkHomes()) {
    const javacPath = javacIn(home);
    if (!javacPath) continue;
    const info = describe(home, 'IDE runtime', javacPath);
    if (info) {
      cached = info;
      return info;
    }
  }

  cached = missing;
  return cached;
}

function killTree(child) {
  if (!child || child.killed) {
    try { child?.kill('SIGKILL'); } catch { /* already gone */ }
    return;
  }
  if (process.platform === 'win32') {
    try {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.on('error', () => {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      });
    } catch {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

function runProcess(command, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let child;
    let hardTimer;
    let timer;

    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardTimer);
      resolve({ code, signal, stdout, stderr, timedOut });
    };

    try {
      child = spawn(command, args, {
        cwd,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({
        code: -1,
        signal: null,
        stdout: '',
        stderr: `Failed to start ${command}: ${error.message}`,
        timedOut: false,
      });
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      hardTimer = setTimeout(() => finish(null, 'SIGKILL'), 3000);
    }, Math.max(500, timeoutMs));

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 300000) stdout = stdout.slice(-300000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 300000) stderr = stderr.slice(-300000);
    });
    child.on('error', (error) => {
      stderr += `\n${error.message}`;
      finish(-1, null);
    });
    child.on('close', (code, signal) => finish(code, signal));
  });
}

function safeRelativeName(name) {
  const base = path.basename(String(name || ''));
  if (!base.endsWith('.java')) throw new Error(`Java file name must end in .java: ${name}`);
  if (!/^[A-Za-z_$][A-Za-z0-9_$.-]*$/.test(base)) {
    throw new Error(`Unsafe Java file name: ${name}`);
  }
  return base;
}

function prepareWorkspace(entries) {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'interview-sim-'));
  const outDir = path.join(workspace, 'out');
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const entry of entries) {
    const name = safeRelativeName(entry.fileName);
    const full = path.join(workspace, name);
    writeFileSync(full, entry.source, 'utf8');
    files.push(full);
  }
  return { workspace, outDir, files };
}

async function compile(jdk, workspace, outDir, files) {
  const result = await runProcess(jdk.javac, ['--release', '17', '-encoding', 'UTF-8', '-d', outDir, ...files], {
    cwd: workspace,
    timeoutMs: 45000,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return {
    ok: result.code === 0 && !result.timedOut,
    timedOut: result.timedOut,
    output: output || (result.code === 0 ? 'Compilation succeeded.' : 'Compilation failed with no output.'),
  };
}

function cleanup(workspace) {
  try {
    rmSync(workspace, { recursive: true, force: true });
  } catch {
    /* temporary directory is best-effort */
  }
}

export async function compileOnly({ source, fileName, testSupport, tests = [] }) {
  const jdk = detectJdk();
  if (!jdk.available) return { ok: false, output: INSTALL_STEPS.join('\n') };
  const entries = [{ fileName, source }];
  if (testSupport) entries.push({ fileName: 'TestSupport.java', source: testSupport });
  for (const test of tests) entries.push({ fileName: `${test.className}.java`, source: test.code });
  const { workspace, outDir, files } = prepareWorkspace(entries);
  try {
    return await compile(jdk, workspace, outDir, files);
  } finally {
    cleanup(workspace);
  }
}

export async function runSubmission({
  source,
  fileName,
  testSupport,
  tests = [],
  perTestTimeoutMs = 6000,
  totalTimeoutMs = 40000,
}) {
  const jdk = detectJdk();
  if (!jdk.available) {
    return {
      available: false,
      compiled: false,
      compileOutput: INSTALL_STEPS.join('\n'),
      results: [],
      jdk,
    };
  }

  const entries = [{ fileName, source }];
  if (testSupport) entries.push({ fileName: 'TestSupport.java', source: testSupport });
  for (const test of tests) entries.push({ fileName: `${test.className}.java`, source: test.code });

  const { workspace, outDir, files } = prepareWorkspace(entries);
  try {
    const compiled = await compile(jdk, workspace, outDir, files);
    if (!compiled.ok) {
      return {
        available: true,
        compiled: false,
        compileOutput: compiled.output,
        results: [],
        jdk,
      };
    }

    const started = Date.now();
    const results = [];
    for (const test of tests) {
      const remaining = totalTimeoutMs - (Date.now() - started);
      if (remaining < 300) {
        results.push({
          name: test.name,
          className: test.className,
          passed: false,
          timedOut: false,
          ran: false,
          output: 'Skipped: the total test time budget was exhausted before this test started.',
        });
        continue;
      }
      const run = await runProcess(jdk.java, ['-cp', outDir, test.className], {
        cwd: workspace,
        timeoutMs: Math.min(perTestTimeoutMs, remaining),
      });
      const output = [run.stdout, run.stderr].filter(Boolean).join('\n').trim();
      results.push({
        name: test.name,
        className: test.className,
        passed: run.code === 0 && !run.timedOut,
        timedOut: run.timedOut,
        ran: true,
        exitCode: run.code,
        output: run.timedOut
          ? `${output}\nTimed out after ${Math.min(perTestTimeoutMs, remaining)} ms.`
          : (output || 'Test produced no output.'),
      });
    }

    return {
      available: true,
      compiled: true,
      compileOutput: compiled.output,
      results,
      jdk,
    };
  } finally {
    cleanup(workspace);
  }
}
