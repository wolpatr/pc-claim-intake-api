import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { compileOnly, detectJdk, hasJavaTypeDeclaration, javaFileNameFor, runSubmission } from './lib/java.mjs';
import { getScenario, loadScenarios, publicScenario, roundTypeOf, scenarioSummary } from './lib/scenarios.mjs';
import { aiStatus, clarifyingAnswer, adaptiveProbe, debriefNarrative } from './lib/ai.mjs';
import { appendProgress, readProgress } from './lib/progress.mjs';
import {
  DEFAULT_EXAM_MINUTES,
  loadQuizBank,
  publicExamQuestion,
  scoreExam,
  selectExamQuestions,
} from './lib/exam.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const DEFAULT_HOST = '127.0.0.1';
const PORT = Number(process.env.INTERVIEW_SIM_PORT || 4321);
const MAX_BODY = 3 * 1024 * 1024;

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const failStartup = (message) => {
  writeFileSync(2, `${message}\n`);
  process.exit(1);
};
const LAN_ENABLED = truthy(process.env.INTERVIEW_SIM_LAN);
const HTTPS_ENABLED = truthy(process.env.INTERVIEW_SIM_HTTPS);
const HOST = process.env.INTERVIEW_SIM_HOST || (LAN_ENABLED ? '0.0.0.0' : DEFAULT_HOST);
const SCHEME = HTTPS_ENABLED ? 'https' : 'http';

function detectLanAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '';
}

const LAN_HOST = String(process.env.INTERVIEW_SIM_PUBLIC_HOST || '').trim() || (LAN_ENABLED ? detectLanAddress() : '');
if (LAN_ENABLED && !LAN_HOST) {
  failStartup('LAN mode needs a reachable address. Set INTERVIEW_SIM_PUBLIC_HOST to this computer\'s Wi-Fi IPv4 address.');
}

const LOCAL_HOST = HOST === '0.0.0.0' ? DEFAULT_HOST : HOST;
const formatHost = (host) => (isIP(host) === 6 ? `[${host}]` : host);
const URL_HOST = formatHost(LAN_ENABLED ? LAN_HOST : LOCAL_HOST);
const BASE_URL = `${SCHEME}://${URL_HOST}:${PORT}`;

function parsePublicUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const reject = (reason) => {
    throw new Error(`INTERVIEW_SIM_PUBLIC_URL ${reason}. Use an https origin such as https://<machine>.<tailnet>.ts.net:8443`);
  };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    reject('is not a valid URL');
  }
  if (parsed.protocol !== 'https:') reject('must start with https://');
  if (!parsed.hostname) reject('must include a hostname');
  if (parsed.username || parsed.password) reject('must not include credentials');
  if (parsed.search) reject('must not include a query string');
  if (parsed.hash) reject('must not include a fragment');
  if (parsed.pathname !== '/') reject('must not include a path');
  return parsed;
}

let PUBLIC_URL = null;
try {
  PUBLIC_URL = parsePublicUrl(process.env.INTERVIEW_SIM_PUBLIC_URL);
} catch (error) {
  failStartup(error instanceof Error ? error.message : String(error));
}
const DISPLAY_URL = PUBLIC_URL ? PUBLIC_URL.origin : BASE_URL;

const DEFAULT_PORT = HTTPS_ENABLED ? 443 : 80;
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
if (PORT === 80) {
  ALLOWED_HOSTS.add('127.0.0.1');
  ALLOWED_HOSTS.add('localhost');
  ALLOWED_ORIGINS.add('http://127.0.0.1');
  ALLOWED_ORIGINS.add('http://localhost');
}
if (HTTPS_ENABLED) {
  ALLOWED_ORIGINS.add(`https://127.0.0.1:${PORT}`);
  ALLOWED_ORIGINS.add(`https://localhost:${PORT}`);
  if (PORT === 443) {
    ALLOWED_HOSTS.add('127.0.0.1');
    ALLOWED_HOSTS.add('localhost');
    ALLOWED_ORIGINS.add('https://127.0.0.1');
    ALLOWED_ORIGINS.add('https://localhost');
  }
}
if (LAN_ENABLED) {
  ALLOWED_HOSTS.add(`${URL_HOST}:${PORT}`.toLowerCase());
  ALLOWED_ORIGINS.add(`${SCHEME}://${URL_HOST}:${PORT}`.toLowerCase());
  if (PORT === DEFAULT_PORT) {
    ALLOWED_HOSTS.add(URL_HOST.toLowerCase());
    ALLOWED_ORIGINS.add(`${SCHEME}://${URL_HOST}`.toLowerCase());
  }
}
if (PUBLIC_URL) {
  ALLOWED_HOSTS.add(PUBLIC_URL.host.toLowerCase());
  ALLOWED_ORIGINS.add(PUBLIC_URL.origin.toLowerCase());
}

function isAllowedHost(hostHeader) {
  return Boolean(hostHeader) && ALLOWED_HOSTS.has(String(hostHeader).toLowerCase());
}

function isAllowedOrigin(originHeader) {
  return !originHeader || ALLOWED_ORIGINS.has(String(originHeader).toLowerCase());
}

function isJsonContentType(request) {
  const type = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  return type === 'application/json';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function readTlsPair(certPath, keyPath) {
  const [cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)]);
  return { cert, key };
}

function generateSelfSignedCertificate(certDir, hostName) {
  const caKeyPath = path.join(certDir, 'ca-key.pem');
  const caPath = path.join(certDir, 'ca.pem');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');
  const csrPath = path.join(certDir, 'server.csr');
  const extPath = path.join(certDir, 'server.ext');
  const san = new Set(['DNS:localhost', 'IP:127.0.0.1']);
  if (isIP(hostName)) san.add(`IP:${hostName}`);
  else san.add(`DNS:${hostName}`);
  const ext = [
    'basicConstraints=critical,CA:FALSE',
    'keyUsage=critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage=serverAuth',
    `subjectAltName=${[...san].join(',')}`,
    '',
  ].join('\n');
  writeFileSync(extPath, ext);
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '3650',
      '-keyout', caKeyPath, '-out', caPath,
      '-subj', '/CN=Interview Sim Local CA',
      '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
    ], { stdio: 'pipe', windowsHide: true });
    execFileSync('openssl', [
      'req', '-newkey', 'rsa:2048', '-sha256', '-nodes',
      '-keyout', keyPath, '-out', csrPath,
      '-subj', `/CN=${hostName}`,
    ], { stdio: 'pipe', windowsHide: true });
    execFileSync('openssl', [
      'x509', '-req', '-in', csrPath, '-CA', caPath, '-CAkey', caKeyPath,
      '-CAcreateserial', '-out', certPath, '-days', '825', '-sha256', '-extfile', extPath,
    ], { stdio: 'pipe', windowsHide: true });
  } catch (error) {
    const detail = error && error.code === 'ENOENT'
      ? 'OpenSSL was not found on PATH.'
      : String(error && error.stderr ? error.stderr : error && error.message ? error.message : error).trim();
    throw new Error(`${detail} Install OpenSSL, or set INTERVIEW_SIM_TLS_CERT and INTERVIEW_SIM_TLS_KEY to an existing certificate and key.`);
  }
  return { caPath, keyPath, certPath };
}

async function ensureTls() {
  const configuredCert = String(process.env.INTERVIEW_SIM_TLS_CERT || '').trim();
  const configuredKey = String(process.env.INTERVIEW_SIM_TLS_KEY || '').trim();
  if (configuredCert || configuredKey) {
    if (!configuredCert || !configuredKey) {
      throw new Error('Set both INTERVIEW_SIM_TLS_CERT and INTERVIEW_SIM_TLS_KEY, or neither to generate a self-signed pair.');
    }
    const pair = await readTlsPair(configuredCert, configuredKey);
    return { ...pair, certPath: configuredCert, keyPath: configuredKey, ca: null, caPath: null, generated: false };
  }

  const certDir = path.join(here, '.certs');
  const certPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');
  const caPath = path.join(certDir, 'ca.pem');
  const hostMarkerPath = path.join(certDir, 'host.txt');
  const hostName = LAN_HOST || 'localhost';

  let marker = '';
  try {
    marker = (await readFile(hostMarkerPath, 'utf8')).trim();
  } catch {
    marker = '';
  }

  if (marker === hostName) {
    try {
      const pair = await readTlsPair(certPath, keyPath);
      const ca = await readFile(caPath);
      return { ...pair, ca, certPath, keyPath, caPath, generated: true };
    } catch {
      marker = '';
    }
  }

  await mkdir(certDir, { recursive: true });
  const generated = generateSelfSignedCertificate(certDir, hostName);
  await writeFile(hostMarkerPath, `${hostName}\n`);
  const pair = await readTlsPair(generated.certPath, generated.keyPath);
  const ca = await readFile(generated.caPath);
  await Promise.all([
    unlink(path.join(certDir, 'server.csr')).catch(() => {}),
    unlink(path.join(certDir, 'server.ext')).catch(() => {}),
    unlink(path.join(certDir, 'ca.srl')).catch(() => {}),
  ]);
  return { ...pair, ca, certPath: generated.certPath, keyPath: generated.keyPath, caPath: generated.caPath, generated: true };
}

let tls = null;
if (HTTPS_ENABLED) {
  try {
    tls = await ensureTls();
  } catch (error) {
    failStartup(`HTTPS mode could not start: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

function safeString(value, max = 2000) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

async function serveStatic(request, response, pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!relative) relative = 'index.html';
  const full = path.resolve(publicDir, relative);
  if (full !== publicDir && !full.startsWith(publicDir + path.sep)) {
    sendJson(response, 403, { error: 'Forbidden.' });
    return;
  }
  try {
    const content = await readFile(full);
    const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': content.length,
      'Cache-Control': 'no-cache',
    });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: 'Not found.' });
  }
}

async function handleApi(request, response, url) {
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/api/health') {
    const jdk = detectJdk();
    sendJson(response, 200, { ok: true, jdk, ai: aiStatus() });
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/scenarios') {
    sendJson(response, 200, { scenarios: loadScenarios().map(scenarioSummary) });
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/exam') {
    const idsParam = url.searchParams.get('ids');
    const ids = idsParam === null
      ? null
      : idsParam.split(',').map((id) => id.trim()).filter(Boolean);
    if (ids && !ids.length) {
      sendJson(response, 400, { error: 'A focused retake needs at least one question id.' });
      return true;
    }
    const questions = ids ? selectExamQuestions({ ids }) : selectExamQuestions();
    if (!questions) {
      sendJson(response, 400, { error: 'Unknown exam question id.' });
      return true;
    }
    const bank = loadQuizBank();
    sendJson(response, 200, {
      mode: ids ? 'focused' : 'standard',
      defaultMinutes: DEFAULT_EXAM_MINUTES,
      count: questions.length,
      topics: bank.topics.map((topic) => ({ id: topic.id, name: topic.name })),
      questions: questions.map(publicExamQuestion),
    });
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/exam/score') {
    const body = await readBody(request);
    const rawIds = Array.isArray(body.questionIds) ? body.questionIds : [];
    const questionIds = rawIds.slice(0, 200).map((id) => safeString(id, 80));
    if (!questionIds.length) {
      sendJson(response, 400, { error: 'questionIds must be a non-empty array.' });
      return true;
    }
    if (new Set(questionIds).size !== questionIds.length) {
      sendJson(response, 400, { error: 'questionIds must be unique.' });
      return true;
    }
    const bankIds = new Set(loadQuizBank().questions.map((question) => question.id));
    const unknown = questionIds.filter((id) => !bankIds.has(id));
    if (unknown.length) {
      sendJson(response, 400, { error: `Unknown question id: ${unknown[0]}` });
      return true;
    }
    const answers = Array.isArray(body.answers)
      ? body.answers.slice(0, 200).map((answer) => ({
        id: safeString(answer?.id, 80),
        selected: answer?.selected ?? null,
      }))
      : [];
    sendJson(response, 200, scoreExam(questionIds, answers));
    return true;
  }

  if (request.method === 'GET' && pathname.startsWith('/api/scenarios/')) {
    const id = decodeURIComponent(pathname.slice('/api/scenarios/'.length));
    const scenario = getScenario(id);
    if (!scenario) {
      sendJson(response, 404, { error: `Unknown scenario: ${id}` });
      return true;
    }
    sendJson(response, 200, { scenario: publicScenario(scenario) });
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/ai/status') {
    sendJson(response, 200, aiStatus());
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/run') {
    const body = await readBody(request);
    const scenario = getScenario(safeString(body.scenarioId, 120));
    if (!scenario) {
      sendJson(response, 404, { error: 'Unknown scenario.' });
      return true;
    }
    const source = safeString(body.source, 500000);
    const set = body.phase === 'change' ? 'change' : 'base';
    if (roundTypeOf(scenario) === 'design') {
      const jdk = detectJdk();
      if (!jdk.available) {
        sendJson(response, 200, {
          set,
          design: true,
          available: false,
          compiled: false,
          sketch: 'unavailable',
          compileOutput: 'No JDK is available, so the optional class sketch cannot be checked. Design rounds run without a JDK; your design notes still score normally.',
          results: [],
        });
        return true;
      }
      if (!hasJavaTypeDeclaration(source) || !scenario.fileName) {
        sendJson(response, 200, {
          set,
          design: true,
          available: true,
          compiled: false,
          sketch: 'notes',
          compileOutput: 'No compiling class sketch found; design notes do not need to compile.',
          results: [],
        });
        return true;
      }
      const compiled = await compileOnly({
        source,
        fileName: javaFileNameFor(source, scenario.fileName),
        testSupport: '',
        tests: [],
      });
      sendJson(response, 200, {
        set,
        design: true,
        available: true,
        compiled: compiled.ok,
        sketch: compiled.ok ? 'compiled' : 'failed',
        compileOutput: compiled.output,
        results: [],
      });
      return true;
    }
    if (!source.trim()) {
      sendJson(response, 400, { error: 'No candidate source code was supplied.' });
      return true;
    }
    if (set === 'change' && !scenario.changeRequest) {
      sendJson(response, 400, { error: 'This scenario has no change request.' });
      return true;
    }
    const tests = set === 'change' ? scenario.changeRequest.hiddenTests : scenario.hiddenTests;
    const fileName = set === 'change' ? scenario.changeRequest.fileName : scenario.fileName;
    const result = await runSubmission({
      source,
      fileName,
      testSupport: scenario.testSupport,
      tests,
    });
    sendJson(response, result.available ? 200 : 409, {
      set,
      error: result.available ? undefined : result.compileOutput,
      ...result,
    });
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/ai/ask') {
    const body = await readBody(request);
    const scenario = getScenario(safeString(body.scenarioId, 120));
    const question = safeString(body.question, 2000).trim();
    if (!scenario || !question) {
      sendJson(response, 400, { error: 'scenarioId and question are required.' });
      return true;
    }
    const answer = await clarifyingAnswer(scenario, question);
    sendJson(response, 200, answer);
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/ai/probe') {
    const body = await readBody(request);
    const scenario = getScenario(safeString(body.scenarioId, 120));
    if (!scenario) {
      sendJson(response, 400, { error: 'Unknown scenario.' });
      return true;
    }
    const usedProbes = Array.isArray(body.usedProbes)
      ? body.usedProbes.slice(0, 60).map((item) => safeString(item, 800))
      : [];
    const probe = await adaptiveProbe(scenario, {
      code: safeString(body.code, 200000),
      phase: safeString(body.phase, 40),
      elapsedSeconds: Number(body.elapsedSeconds) || 0,
      usedProbes,
    });
    sendJson(response, 200, probe);
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/ai/debrief') {
    const body = await readBody(request);
    const scenario = getScenario(safeString(body.scenarioId, 120));
    if (!scenario) {
      sendJson(response, 400, { error: 'Unknown scenario.' });
      return true;
    }
    const summary = body.summary && typeof body.summary === 'object' ? body.summary : {};
    const narrative = await debriefNarrative(scenario, summary);
    sendJson(response, 200, narrative);
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/progress') {
    const records = await readProgress();
    sendJson(response, 200, { records });
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/progress') {
    const body = await readBody(request);
    if (!body.record || typeof body.record !== 'object') {
      sendJson(response, 400, { error: 'A progress record is required.' });
      return true;
    }
    const record = await appendProgress(body.record);
    sendJson(response, 201, { record });
    return true;
  }

  return false;
}

const requestHandler = async (request, response) => {
  if (!isAllowedHost(request.headers.host)) {
    sendJson(response, 403, { error: 'Forbidden host.' });
    return;
  }
  const url = new URL(request.url || '/', BASE_URL);
  try {
    if (HTTPS_ENABLED && tls && tls.ca && request.method === 'GET' && url.pathname === '/interview-sim-ca.crt') {
      response.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Length': tls.ca.length,
        'Content-Disposition': 'attachment; filename="interview-sim-ca.crt"',
        'Cache-Control': 'no-store',
      });
      response.end(tls.ca);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (!isAllowedOrigin(request.headers.origin)) {
        sendJson(response, 403, { error: 'Forbidden origin.' });
        return;
      }
      if (request.method === 'POST' && !isJsonContentType(request)) {
        sendJson(response, 415, { error: 'Content-Type must be application/json.' });
        return;
      }
      const handled = await handleApi(request, response, url);
      if (!handled) sendJson(response, 404, { error: 'Unknown API route.' });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    if (!response.headersSent) {
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      sendJson(response, 500, { error: message });
    } else {
      response.end();
    }
  }
};

const server = HTTPS_ENABLED
  ? https.createServer({ key: tls.key, cert: tls.cert }, requestHandler)
  : http.createServer(requestHandler);

const jdk = detectJdk();
const ai = aiStatus();

server.listen(PORT, HOST, () => {
  loadScenarios();
  process.stdout.write(`Interview simulator: ${DISPLAY_URL}\n`);
  if (PUBLIC_URL) {
    process.stdout.write(`Public origin: ${PUBLIC_URL.origin} (proxied to ${HOST}:${PORT}; Tailscale Serve terminates TLS)\n`);
  }
  if (LAN_ENABLED) {
    process.stdout.write(`LAN mode: enabled (bound to ${HOST})\n`);
    if (HTTPS_ENABLED && tls && tls.generated) {
      process.stdout.write(`Self-signed CA: ${tls.caPath}\n`);
      process.stdout.write(`Install it on the phone from ${BASE_URL}/interview-sim-ca.crt\n`);
    }
  } else if (HTTPS_ENABLED) {
    process.stdout.write(`HTTPS mode: enabled (bound to ${HOST})\n`);
    if (tls && tls.generated) process.stdout.write(`Self-signed CA: ${tls.caPath}\n`);
  }
  process.stdout.write(`JDK: ${jdk.available ? `${jdk.version} (${jdk.source})` : 'not found'}\n`);
  process.stdout.write(`Interviewer: ${ai.configured ? `hybrid AI (${ai.model})` : 'scripted only'}\n`);
  process.stdout.write('Press Ctrl+C to stop.\n');
});
