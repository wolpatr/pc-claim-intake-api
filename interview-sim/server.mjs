import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compileOnly, detectJdk, hasJavaTypeDeclaration, javaFileNameFor, runSubmission } from './lib/java.mjs';
import { getScenario, loadScenarios, publicScenario, roundTypeOf, scenarioSummary } from './lib/scenarios.mjs';
import { aiStatus, clarifyingAnswer, adaptiveProbe, debriefNarrative } from './lib/ai.mjs';
import { appendProgress, readProgress } from './lib/progress.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const HOST = '127.0.0.1';
const PORT = Number(process.env.INTERVIEW_SIM_PORT || 4321);
const MAX_BODY = 3 * 1024 * 1024;

const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
if (PORT === 80) {
  ALLOWED_HOSTS.add('127.0.0.1');
  ALLOWED_HOSTS.add('localhost');
  ALLOWED_ORIGINS.add('http://127.0.0.1');
  ALLOWED_ORIGINS.add('http://localhost');
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
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

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

const server = http.createServer(async (request, response) => {
  if (!isAllowedHost(request.headers.host)) {
    sendJson(response, 403, { error: 'Forbidden host.' });
    return;
  }
  const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  try {
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
});

const jdk = detectJdk();
const ai = aiStatus();

server.listen(PORT, HOST, () => {
  loadScenarios();
  process.stdout.write(`Interview simulator: http://${HOST}:${PORT}\n`);
  process.stdout.write(`JDK: ${jdk.available ? `${jdk.version} (${jdk.source})` : 'not found'}\n`);
  process.stdout.write(`Interviewer: ${ai.configured ? `hybrid AI (${ai.model})` : 'scripted only'}\n`);
  process.stdout.write('Press Ctrl+C to stop.\n');
});
