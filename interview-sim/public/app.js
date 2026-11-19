const PHASES = [
  { key: 'brief', label: 'Brief & Clarify', short: 'Brief' },
  { key: 'implement', label: 'Implement', short: 'Code' },
  { key: 'test', label: 'Test', short: 'Test' },
  { key: 'change', label: 'Change Request', short: 'Change' },
  { key: 'debrief', label: 'Debrief', short: 'Debrief' },
];

const HINT_LABELS = ['nudge', 'direction', 'near answer'];
const HINT_SCORES = [1, 0.8, 0.6, 0.4];

const state = {
  scenarios: [],
  jdk: null,
  ai: null,
  progress: [],
  scenario: null,
  pendingScenario: null,
  minutes: {},
  budgets: {},
  elapsed: {},
  phaseIndex: 0,
  remaining: 0,
  running: false,
  lastTick: 0,
  ticker: null,
  active: false,
  probesSeen: [],
  hints: [],
  clarify: { asked: 0, matched: new Set() },
  changeLoaded: false,
  savedImplementCode: null,
  baseRun: null,
  changeRun: null,
  debriefRunning: false,
  debriefRendered: false,
  debriefPrompted: false,
  clarifyBusy: false,
  probeBusy: false,
  runBusy: false,
  progressSaved: false,
  sessionToken: 0,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderMarkdown(markdown) {
  const lines = escapeHtml(markdown || '').split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let list = null;
  let code = null;
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (code !== null) {
      if (/^```/.test(line)) {
        out.push(`<pre>${codeLines.join('\n')}</pre>`);
        code = null;
        codeLines = [];
      } else {
        codeLines.push(raw);
      }
      continue;
    }
    if (/^```/.test(line)) {
      flushParagraph();
      closeList();
      code = [];
      codeLines = [];
      continue;
    }
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(4, heading[1].length);
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inlineMarkdown(numbered[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  if (code !== null) out.push(`<pre>${codeLines.join('\n')}</pre>`);
  flushParagraph();
  closeList();
  return out.join('\n');
}

async function api(path, options) {
  const response = await fetch(path, options);
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}

let toastTimer = null;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 6000);
}

function clock(seconds, roundUp = true) {
  const safe = Math.max(0, roundUp ? Math.ceil(seconds) : Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function duration(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

function currentPhase() {
  return PHASES[state.phaseIndex].key;
}

function activePhaseKeys() {
  return PHASES.filter((phase) => phase.key !== 'debrief').map((phase) => phase.key);
}

function totalPhaseMinutes(phaseTimes) {
  return Object.values(phaseTimes).reduce((sum, value) => sum + Number(value || 0), 0);
}

function renderStatus() {
  const jdkChip = $('jdkChip');
  if (state.jdk?.available) {
    jdkChip.textContent = `JDK ${state.jdk.version}`;
    jdkChip.className = 'chip ok';
  } else {
    jdkChip.textContent = 'JDK missing';
    jdkChip.className = 'chip bad';
  }

  const aiChip = $('aiChip');
  if (state.ai?.configured) {
    aiChip.textContent = `AI interviewer · ${state.ai.model}`;
    aiChip.className = 'chip ok';
  } else {
    aiChip.textContent = 'Scripted interviewer';
    aiChip.className = 'chip';
  }

  const warning = $('jdkWarning');
  const steps = $('installSteps');
  steps.innerHTML = '';
  if (!state.jdk?.available) {
    warning.classList.remove('hidden');
    for (const step of state.jdk?.installSteps || []) {
      const item = document.createElement('li');
      item.textContent = step;
      steps.appendChild(item);
    }
  } else {
    warning.classList.add('hidden');
  }

  $('aiModeNote').textContent = state.ai?.configured
    ? `Hybrid mode: scripted spine plus AI clarify answers, one adaptive probe, and the debrief narrative. Model: ${state.ai.model}.`
    : 'Scripted mode: every answer, probe, and debrief works with no network or API key.';
  $('scenarioCount').textContent = String(state.scenarios.length || 6);
}

function renderScenarios() {
  const grid = $('scenarioGrid');
  grid.innerHTML = '';
  for (const scenario of state.scenarios) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'scenario-card';
    card.disabled = !state.jdk?.available;
    card.dataset.scenarioId = scenario.id;

    const top = document.createElement('div');
    top.className = 'card-top';
    const difficulty = document.createElement('span');
    difficulty.className = 'difficulty';
    difficulty.textContent = scenario.difficulty;
    const time = document.createElement('span');
    time.className = 'card-time';
    time.textContent = `${totalPhaseMinutes(scenario.phaseTimes)} min`;
    top.append(difficulty, time);

    const title = document.createElement('h4');
    title.textContent = scenario.title;
    const tagline = document.createElement('p');
    tagline.textContent = scenario.tagline;

    const topics = document.createElement('div');
    topics.className = 'card-topics';
    for (const topic of scenario.topics) {
      const chip = document.createElement('span');
      chip.textContent = topic;
      topics.appendChild(chip);
    }

    const start = document.createElement('div');
    start.className = 'card-start';
    const startText = document.createElement('span');
    startText.textContent = state.jdk?.available ? 'Preview and start' : 'JDK required';
    const arrow = document.createElement('span');
    arrow.textContent = '->';
    start.append(startText, arrow);

    card.append(top, title, tagline, topics, start);
    card.addEventListener('click', () => openBriefing(scenario));
    grid.appendChild(card);
  }
}

function openBriefing(scenario) {
  state.pendingScenario = scenario;
  $('briefDifficulty').textContent = `${scenario.difficulty} · ${scenario.topics.join(' · ')}`;
  $('briefTitle').textContent = scenario.title;
  $('briefTagline').textContent = scenario.tagline;
  $('briefIntro').textContent = scenario.intro;
  $('briefProblem').innerHTML = renderMarkdown(scenario.problemStatement);

  const fields = $('phaseTimeFields');
  fields.innerHTML = '';
  for (const phase of PHASES) {
    const label = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = phase.label;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '120';
    input.step = '1';
    input.value = String(scenario.phaseTimes[phase.key]);
    input.dataset.phase = phase.key;
    input.id = `phase-${phase.key}`;
    input.name = `phase-${phase.key}`;
    label.htmlFor = input.id;
    label.append(span, input);
    fields.appendChild(label);
  }

  const startBtn = $('startSessionBtn');
  startBtn.disabled = !state.jdk?.available;
  startBtn.textContent = state.jdk?.available ? 'Start session' : 'Install a JDK first';
  $('briefJdkNote').textContent = state.jdk?.available
    ? `Detected ${state.jdk.version} via ${state.jdk.source}. Code is compiled with --release 17.`
    : 'No JDK detected. Follow the install steps on the previous screen, then restart the simulator.';

  $('briefingDialog').showModal();
}

function startSession(scenario, minutes) {
  if (!state.jdk?.available) {
    showToast('A JDK is required before starting a session.');
    return;
  }
  state.scenario = scenario;
  state.minutes = { ...minutes };
  state.budgets = {};
  state.elapsed = {};
  for (const phase of PHASES) {
    const value = Math.max(1, Math.min(120, Number(minutes[phase.key]) || scenario.phaseTimes[phase.key] || 1));
    state.budgets[phase.key] = Math.round(value * 60);
    state.elapsed[phase.key] = 0;
  }
  state.phaseIndex = 0;
  state.remaining = state.budgets.brief;
  state.running = true;
  state.lastTick = performance.now();
  state.active = true;
  state.probesSeen = [];
  state.hints = [];
  state.clarify = { asked: 0, matched: new Set() };
  state.changeLoaded = false;
  state.savedImplementCode = null;
  state.baseRun = null;
  state.changeRun = null;
  state.debriefRunning = false;
  state.debriefRendered = false;
  state.debriefPrompted = false;
  state.clarifyBusy = false;
  state.probeBusy = false;
  state.runBusy = false;
  state.progressSaved = false;
  state.sessionToken += 1;

  $('scenarioTitle').textContent = scenario.title;
  $('scenarioDifficulty').textContent = `${scenario.difficulty} · ${scenario.fileName}`;
  $('topicChips').innerHTML = '';
  for (const topic of scenario.topics) {
    const chip = document.createElement('span');
    chip.textContent = topic;
    $('topicChips').appendChild(chip);
  }
  $('problemStatement').innerHTML = renderMarkdown(scenario.problemStatement);
  $('fileNameLabel').textContent = scenario.fileName;
  $('changeTitle').textContent = scenario.changeRequest?.prompt || 'Change request';
  $('changeStatement').innerHTML = renderMarkdown(scenario.changeRequest?.statement || '');
  $('changeCard').classList.add('hidden');
  $('editor').value = scenario.starterCode;
  $('chatLog').innerHTML = '';
  $('consoleOutput').innerHTML = '<p class="muted">Run the tests to see compile output and per-test results.</p>';
  $('consoleStatus').textContent = 'Not run yet';
  $('clarifyInput').value = '';
  $('clarifyInput').disabled = false;
  $('clarifyForm').querySelector('button').disabled = false;
  $('restoreCodeBtn').classList.add('hidden');
  $('loadChangeBtn').classList.add('hidden');

  $('briefingDialog').close();
  $('debriefDialog').close();
  $('setupScreen').classList.add('hidden');
  $('sessionScreen').classList.remove('hidden');
  $('exitBtn').classList.remove('hidden');

  addMessage('interviewer', scenario.intro, { meta: 'Opening' });
  addMessage('interviewer', scenario.phasePrompts.brief, { meta: 'Brief & Clarify' });
  updateClarifyCounter();
  updateHintButton();
  renderPhaseUI();
  renderTimer();
  startTicker();
}

function startTicker() {
  if (state.ticker) clearInterval(state.ticker);
  state.ticker = setInterval(tick, 250);
}

function tick() {
  if (!state.active || !state.running) return;
  const now = performance.now();
  const delta = Math.max(0, (now - state.lastTick) / 1000);
  state.lastTick = now;
  const key = currentPhase();
  const before = state.budgets[key] - state.elapsed[key];
  state.elapsed[key] += delta;
  state.remaining = Math.max(0, state.budgets[key] - state.elapsed[key]);
  checkProbes(key);
  renderTimer();

  if (state.remaining <= 0 && before > 0) {
    addMessage('system', 'Time is up for this phase. Overtime keeps counting against time discipline; press Next phase when you are ready.');
    renderPhaseUI();
    renderTimer();
  }
}

function recordProbe(text) {
  if (text && !state.probesSeen.includes(text)) state.probesSeen.push(text);
}

function checkProbes(phaseKey) {
  for (const probe of state.scenario.probes || []) {
    if ((probe.phase || 'implement') !== phaseKey) continue;
    if (state.probesSeen.includes(probe.text)) continue;
    if (state.elapsed[phaseKey] >= Number(probe.atMinute) * 60) {
      recordProbe(probe.text);
      addMessage('interviewer', probe.text, { meta: `Checkpoint at ${probe.atMinute} min`, tone: 'probe' });
    }
  }
}

function renderTimer() {
  const key = currentPhase();
  const remaining = state.remaining;
  $('timerValue').textContent = clock(remaining);
  const ratio = state.budgets[key] ? Math.max(0, Math.min(1, remaining / state.budgets[key])) : 0;
  const bar = $('timerBar');
  bar.style.width = `${ratio * 100}%`;
  const low = remaining <= 60;
  bar.classList.toggle('low', low);
  $('timerValue').classList.toggle('low', low);
}

function renderPhaseUI() {
  $('phaseLabel').textContent = PHASES[state.phaseIndex].label;
  const steps = $('phaseSteps');
  steps.innerHTML = '';
  PHASES.forEach((phase, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = phase.short;
    button.className = index === state.phaseIndex ? 'active' : (index < state.phaseIndex ? 'done' : '');
    button.addEventListener('click', () => jumpToPhase(index));
    steps.appendChild(button);
  });

  $('pauseBtn').textContent = state.running ? 'Pause' : 'Resume';
  $('nextPhaseBtn').textContent = state.phaseIndex >= PHASES.length - 1 ? 'Finish and debrief' : 'Next phase';
  const key = currentPhase();
  $('loadChangeBtn').classList.toggle('hidden', key !== 'change');
  $('changeCard').classList.toggle('hidden', state.phaseIndex < 3);
  $('runBtn').disabled = state.runBusy || key === 'debrief';
  $('runBtn').textContent = state.runBusy
    ? 'Running...'
    : (key === 'change' ? 'Run change tests' : 'Run tests');
  const closed = key === 'debrief';
  $('hintBtn').disabled = closed || state.hints.length >= (state.scenario?.hints?.length || 3);
  $('probeBtn').disabled = closed || state.probeBusy;
  $('clarifyInput').disabled = closed;
  $('clarifyForm').querySelector('button').disabled = closed;
  $('resetPhaseBtn').disabled = closed;
  updateHintButton();
}

function addMessage(role, text, options = {}) {
  const log = $('chatLog');
  const message = document.createElement('div');
  message.className = `message ${role}`;
  if (options.tone) message.classList.add(options.tone);
  if (options.meta) {
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = options.meta;
    if (options.source === 'ai') meta.classList.add('ai-source');
    message.appendChild(meta);
  }
  const body = document.createElement('span');
  body.textContent = text;
  message.appendChild(body);
  log.appendChild(message);
  log.scrollTop = log.scrollHeight;
  return message;
}

function updateClarifyCounter() {
  if (!state.scenario) return;
  const expected = state.scenario.clarifyingQuestions.length;
  $('clarifyCounter').textContent = `${state.clarify.asked} asked · ${state.clarify.matched.size}/${expected} coach topics`;
}

function updateHintButton() {
  if (!state.scenario) return;
  const left = Math.max(0, state.scenario.hints.length - state.hints.length);
  $('hintBtn').textContent = left === 0 ? 'Hints used' : `Request hint (${left} left)`;
  $('hintBtn').disabled = left === 0 || currentPhase() === 'debrief';
}

function jumpToPhase(index) {
  if (!state.active) return;
  const target = Math.max(0, Math.min(PHASES.length - 1, index));
  if (target === state.phaseIndex) {
    if (target === PHASES.length - 1 && state.debriefRendered) $('debriefDialog').showModal();
    return;
  }
  if (state.debriefRendered) {
    state.debriefRendered = false;
    state.debriefPrompted = false;
    state.progressSaved = false;
  }
  state.phaseIndex = target;
  const key = currentPhase();
  state.remaining = Math.max(0, state.budgets[key] - state.elapsed[key]);
  state.lastTick = performance.now();

  if (key === 'debrief') {
    state.running = false;
    renderPhaseUI();
    renderTimer();
    openDebrief();
    return;
  }

  state.running = true;
  if (key === 'change') {
    addMessage('interviewer', `Change request: ${state.scenario.changeRequest?.prompt || 'new scope'}. The full statement and starter are in the card above the editor.`, {
      meta: 'Change request',
    });
  } else {
    addMessage('interviewer', state.scenario.phasePrompts[key], { meta: PHASES[target].label });
  }
  renderPhaseUI();
  renderTimer();
}

function advancePhase() {
  if (!state.active) return;
  if (state.phaseIndex >= PHASES.length - 1) {
    openDebrief();
    return;
  }
  jumpToPhase(state.phaseIndex + 1);
}

function togglePause() {
  if (!state.active || currentPhase() === 'debrief') return;
  state.running = !state.running;
  state.lastTick = performance.now();
  renderPhaseUI();
  addMessage('system', state.running ? 'Timer resumed.' : 'Timer paused.');
}

function resetPhase() {
  if (!state.active || currentPhase() === 'debrief') return;
  const key = currentPhase();
  state.elapsed[key] = 0;
  state.remaining = state.budgets[key];
  state.running = true;
  state.lastTick = performance.now();
  renderTimer();
  renderPhaseUI();
  addMessage('system', `${PHASES[state.phaseIndex].label} timer reset.`);
}

async function submitClarify(event) {
  event.preventDefault();
  const input = $('clarifyInput');
  const question = input.value.trim();
  if (!question || state.clarifyBusy || currentPhase() === 'debrief') return;

  const token = state.sessionToken;
  state.clarifyBusy = true;
  input.disabled = true;
  $('clarifyForm').querySelector('button').disabled = true;
  addMessage('candidate', question, { meta: 'You' });
  state.clarify.asked += 1;
  updateClarifyCounter();
  input.value = '';
  const typing = addMessage('interviewer', 'Thinking...', { meta: 'Interviewer' });
  typing.classList.add('typing');

  try {
    const answer = await api('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: state.scenario.id, question }),
    });
    typing.remove();
    if (token !== state.sessionToken) return;
    addMessage('interviewer', answer.answer, {
      meta: answer.source === 'ai' ? 'AI answer' : 'Scripted answer',
      source: answer.source,
    });
    if (answer.matchedId) {
      state.clarify.matched.add(answer.matchedId);
      updateClarifyCounter();
    }
  } catch (error) {
    typing.remove();
    if (token !== state.sessionToken) return;
    addMessage('system', `The interviewer could not answer: ${error.message}`);
    showToast(error.message);
  } finally {
    if (token === state.sessionToken) {
      state.clarifyBusy = false;
      if (currentPhase() !== 'debrief') {
        input.disabled = false;
        $('clarifyForm').querySelector('button').disabled = false;
        input.focus();
      }
    }
  }
}

function requestHint() {
  if (!state.scenario || currentPhase() === 'debrief') return;
  if (state.hints.length >= state.scenario.hints.length) {
    addMessage('interviewer', 'You have used all three hints for this scenario. Work with what you have.');
    return;
  }
  const level = state.hints.length;
  const text = state.scenario.hints[level];
  state.hints.push({
    level,
    label: HINT_LABELS[level],
    phase: currentPhase(),
    atSeconds: Math.round(state.elapsed[currentPhase()] || 0),
  });
  addMessage('interviewer', `Hint ${level + 1} (${HINT_LABELS[level]}): ${text}`, {
    meta: `Hint ${level + 1} of ${state.scenario.hints.length}`,
    tone: 'hint',
  });
  updateHintButton();
}

async function requestProbe() {
  if (!state.scenario || state.probeBusy || currentPhase() === 'debrief') return;
  const token = state.sessionToken;
  state.probeBusy = true;
  renderPhaseUI();
  try {
    const probe = await api('/api/ai/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioId: state.scenario.id,
        code: $('editor').value,
        phase: currentPhase(),
        elapsedSeconds: Math.round(state.elapsed[currentPhase()] || 0),
        usedProbes: state.probesSeen,
      }),
    });
    if (token !== state.sessionToken) return;
    recordProbe(probe.text);
    addMessage('interviewer', probe.text, {
      meta: probe.source === 'ai' ? 'AI follow-up probe' : 'Scripted probe',
      source: probe.source,
      tone: 'probe',
    });
  } catch (error) {
    if (token === state.sessionToken) showToast(error.message);
  } finally {
    if (token === state.sessionToken) {
      state.probeBusy = false;
      renderPhaseUI();
    }
  }
}

function loadChangeStarter() {
  if (!state.scenario?.changeRequest || state.phaseIndex < 3) return;
  if (!state.changeLoaded) {
    state.savedImplementCode = $('editor').value;
  }
  $('editor').value = state.scenario.changeRequest.starterCode;
  state.changeLoaded = true;
  $('restoreCodeBtn').classList.remove('hidden');
  addMessage('system', 'Loaded the change-request starter. Your implementation was saved.');
}

function restoreCode() {
  if (!state.savedImplementCode) return;
  $('editor').value = state.savedImplementCode;
  state.changeLoaded = false;
  $('restoreCodeBtn').classList.add('hidden');
  addMessage('system', 'Restored your implementation from before the change request.');
}

function resetCode() {
  if (!state.scenario) return;
  const useChange = currentPhase() === 'change' && state.scenario.changeRequest;
  const source = useChange ? state.scenario.changeRequest.starterCode : state.scenario.starterCode;
  if (!window.confirm('Replace the editor contents with the starter code?')) return;
  $('editor').value = source;
  state.changeLoaded = Boolean(useChange);
  addMessage('system', 'Editor reset to the starter code.');
}

async function runTests() {
  if (state.runBusy || !state.scenario || currentPhase() === 'debrief') return;
  const token = state.sessionToken;
  const set = currentPhase() === 'change' ? 'change' : 'base';
  state.runBusy = true;
  $('runBtn').disabled = true;
  $('runBtn').textContent = 'Running...';
  const output = $('consoleOutput');
  output.innerHTML = `<p class="run-head">Running ${set === 'change' ? 'change-request' : 'base'} tests...</p>`;
  $('consoleStatus').textContent = 'Running';

  try {
    const result = await api('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: state.scenario.id, source: $('editor').value, phase: set }),
    });
    if (token !== state.sessionToken) return;
    if (set === 'change') state.changeRun = result;
    else state.baseRun = result;
    renderConsole(result, set);
    if (!result.compiled) {
      addMessage('interviewer', 'The build failed. Read the compiler output in the console; fix the first error before chasing the rest.', {
        meta: 'Test run',
      });
    } else {
      const passed = result.results.filter((test) => test.passed).length;
      addMessage('interviewer', `You passed ${passed} of ${result.results.length} ${set === 'change' ? 'change-request' : 'base'} tests.`, {
        meta: 'Test run',
      });
    }
  } catch (error) {
    if (token !== state.sessionToken) return;
    output.innerHTML = '';
    const failure = document.createElement('p');
    failure.className = 'compile-fail';
    failure.textContent = error.message;
    output.appendChild(failure);
    $('consoleStatus').textContent = 'Run failed';
    showToast(error.message);
  } finally {
    if (token === state.sessionToken) {
      state.runBusy = false;
      renderPhaseUI();
    }
  }
}

function renderConsole(result, set) {
  const output = $('consoleOutput');
  output.innerHTML = '';
  const label = set === 'change' ? 'Change-request tests' : 'Base tests';

  if (!result.available) {
    const failure = document.createElement('p');
    failure.className = 'compile-fail';
    failure.textContent = (result.compileOutput || 'No JDK available.');
    output.appendChild(failure);
    $('consoleStatus').textContent = 'JDK unavailable';
    return;
  }

  if (!result.compiled) {
    const head = document.createElement('p');
    head.className = 'run-head';
    head.textContent = `${label}: compilation failed`;
    const failure = document.createElement('pre');
    failure.className = 'compile-fail';
    failure.textContent = result.compileOutput;
    output.append(head, failure);
    $('consoleStatus').textContent = `${label} · build failed`;
    return;
  }

  const passed = result.results.filter((test) => test.passed).length;
  const head = document.createElement('p');
  head.className = 'run-head';
  head.textContent = `${label}: ${passed}/${result.results.length} passing`;
  output.appendChild(head);

  for (const test of result.results) {
    const row = document.createElement('div');
    row.className = 'test-row';
    const pill = document.createElement('span');
    pill.className = `result-pill ${test.passed ? 'pass' : 'fail'}`;
    pill.textContent = test.passed ? 'PASS' : (test.timedOut ? 'TIMEOUT' : 'FAIL');
    const name = document.createElement('span');
    name.textContent = test.name;
    row.append(pill, name);
    output.appendChild(row);
    if (!test.passed && test.output) {
      const detail = document.createElement('pre');
      detail.className = 'test-detail';
      detail.textContent = test.output;
      output.appendChild(detail);
    }
  }
  $('consoleStatus').textContent = `${label} · ${passed}/${result.results.length} passing`;
}

async function runFinal(set, token) {
  try {
    const result = await api('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: state.scenario.id, source: $('editor').value, phase: set }),
    });
    return token === state.sessionToken ? result : null;
  } catch (error) {
    if (token === state.sessionToken) showToast(error.message);
    return null;
  }
}

function ratio(result) {
  if (!result?.compiled || !result.results?.length) return 0;
  return result.results.filter((test) => test.passed).length / result.results.length;
}

function summarizeRun(result) {
  if (!result?.compiled) return { passed: 0, total: result?.results?.length || 0, compiled: false };
  return {
    passed: result.results.filter((test) => test.passed).length,
    total: result.results.length,
    compiled: true,
  };
}

function scoreSession() {
  const baseRatio = ratio(state.baseRun);
  const changeRatio = ratio(state.changeRun);
  const expectedTopics = state.scenario.clarifyingQuestions.length || 1;
  const clarifyRatio = Math.min(1, state.clarify.matched.size / expectedTopics);
  const hintRatio = HINT_SCORES[Math.min(state.hints.length, HINT_SCORES.length - 1)];
  const scoredPhases = activePhaseKeys();
  const totalBudget = scoredPhases.reduce((sum, key) => sum + (state.budgets[key] || 0), 0);
  const totalElapsed = scoredPhases.reduce((sum, key) => sum + (state.elapsed[key] || 0), 0);
  const over = Math.max(0, totalElapsed - totalBudget);
  const efficiency = totalBudget > 0 ? Math.max(0, 1 - over / totalBudget) : 0;
  const sources = { tests: baseRatio, change: changeRatio, clarify: clarifyRatio, hints: hintRatio, efficiency };

  const criteria = state.scenario.rubric.map((item) => {
    const value = sources[item.type] ?? 0;
    return {
      ...item,
      value,
      earned: Math.round(item.weight * value * 10) / 10,
      met: value >= 0.75,
    };
  });
  const score = Math.round(criteria.reduce((sum, item) => sum + item.earned, 0));
  const missed = criteria.filter((item) => !item.met).map((item) => item.criterion);
  let grade = 'Needs another pass';
  if (score >= 85) grade = 'Strong hire signal';
  else if (score >= 70) grade = 'Solid, with gaps';
  else if (score >= 50) grade = 'Developing';
  return { score, grade, criteria, missed, baseRatio, changeRatio, clarifyRatio, hintRatio, efficiency };
}

function buildSummary(scoring) {
  return {
    score: scoring.score,
    grade: scoring.grade,
    tests: { base: summarizeRun(state.baseRun), change: summarizeRun(state.changeRun) },
    hintsUsed: state.hints.length,
    missed: scoring.missed,
    criteria: scoring.criteria.map((item) => ({ criterion: item.criterion, earned: item.earned, weight: item.weight, met: item.met })),
    phaseSeconds: state.elapsed,
    phaseBudgets: state.budgets,
    clarify: {
      asked: state.clarify.asked,
      matchedTopics: state.scenario.clarifyingQuestions
        .filter((item) => state.clarify.matched.has(item.id))
        .map((item) => item.topic),
      expectedTopics: state.scenario.clarifyingQuestions.map((item) => item.topic),
    },
    probesFired: state.probesSeen.length,
    mode: state.ai?.configured ? 'hybrid' : 'scripted',
  };
}

async function openDebrief() {
  if (!state.active || state.debriefRunning) return;
  if (state.debriefRendered) {
    $('debriefDialog').showModal();
    return;
  }
  state.debriefRunning = true;
  const token = state.sessionToken;
  state.running = false;
  state.phaseIndex = PHASES.length - 1;
  renderPhaseUI();
  renderTimer();
  if (!state.debriefPrompted) {
    state.debriefPrompted = true;
    addMessage('interviewer', state.scenario.phasePrompts.debrief, { meta: 'Debrief' });
    addMessage('system', 'Running the hidden tests against your final code, then scoring the rubric.');
  }

  const body = $('debriefBody');
  body.innerHTML = '<p class="muted">Running the final hidden tests against your code...</p>';
  $('debriefTitle').textContent = `${state.scenario.title} · debrief`;
  $('debriefDialog').showModal();

  const base = await runFinal('base', token);
  if (token !== state.sessionToken) return;
  const change = state.scenario.changeRequest ? await runFinal('change', token) : null;
  if (token !== state.sessionToken) return;
  state.baseRun = base;
  state.changeRun = change;

  const scoring = scoreSession();
  const summary = buildSummary(scoring);
  body.innerHTML = '<p class="muted">Scoring the rubric and writing the interviewer debrief...</p>';

  let narrative = { text: '', source: 'scripted' };
  try {
    narrative = await api('/api/ai/debrief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: state.scenario.id, summary }),
    });
  } catch (error) {
    narrative = {
      text: `The interviewer narrative could not be generated. Here is the evidence: ${scoring.score}/100 with ${scoring.missed.length} criteria below the strong band.`,
      source: 'scripted',
    };
    if (token === state.sessionToken) showToast(error.message);
  }
  if (token !== state.sessionToken) return;

  const record = {
    scenarioId: state.scenario.id,
    title: state.scenario.title,
    difficulty: state.scenario.difficulty,
    topics: state.scenario.topics,
    score: scoring.score,
    grade: scoring.grade,
    criteria: scoring.criteria.map((item) => ({
      id: item.id,
      criterion: item.criterion,
      weight: item.weight,
      earned: item.earned,
      met: item.met,
    })),
    missed: scoring.missed,
    tests: summary.tests,
    phaseSeconds: state.elapsed,
    phaseBudgets: state.budgets,
    hints: state.hints,
    clarify: summary.clarify,
    probesFired: state.probesSeen.length,
    mode: summary.mode,
    aiNarrativeSource: narrative.source,
  };

  if (!state.progressSaved) {
    state.progressSaved = true;
    try {
      const saved = await api('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record }),
      });
      if (token === state.sessionToken) state.progress.unshift(saved.record);
    } catch (error) {
      if (token === state.sessionToken) showToast(`Could not save progress: ${error.message}`);
    }
  }
  if (token !== state.sessionToken) return;

  renderDebrief(scoring, summary, narrative);
  state.debriefRendered = true;
  state.debriefRunning = false;
}

function renderDebrief(scoring, summary, narrative) {
  const body = $('debriefBody');
  const narrativeBadge = narrative.source === 'ai'
    ? '<span class="source-badge ai">AI interviewer</span>'
    : '<span class="source-badge scripted">Scripted fallback</span>';

  const rubricRows = scoring.criteria.map((item) => `
    <tr>
      <td>${escapeHtml(item.criterion)}<span class="strong">${escapeHtml(item.strongAnswer)}</span></td>
      <td>${item.weight}</td>
      <td>${item.earned}</td>
      <td class="${item.met ? 'met' : 'missed'}">${item.met ? 'Strong' : 'Below bar'}</td>
    </tr>`).join('');

  const missed = scoring.missed.length
    ? `<ul class="missed-list">${scoring.missed.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="muted">Every rubric criterion reached the strong band.</p>';

  const phaseRows = PHASES.map((phase) => {
    const used = state.elapsed[phase.key] || 0;
    const budget = state.budgets[phase.key] || 0;
    return `<div class="metric-row"><span>${phase.label}</span><span>${duration(used)} / ${clock(budget, false)}</span></div>`;
  }).join('');

  const hintText = state.hints.length
    ? state.hints.map((hint) => `${hint.label} (${hint.phase})`).join(', ')
    : 'none';

  const clarifyRows = state.scenario.clarifyingQuestions.map((item) => {
    const asked = state.clarify.matched.has(item.id);
    return `<div class="coach-item ${asked ? 'asked' : ''}">
      <div class="coach-top"><strong>${escapeHtml(item.topic)}</strong><span>${asked ? 'Asked' : 'Missed'}</span></div>
      <p>${escapeHtml(item.coach)}</p>
    </div>`;
  }).join('');

  const testsHtml = [
    renderTestSummary('Base tests', summary.tests.base, state.baseRun),
    state.scenario.changeRequest
      ? renderTestSummary('Change request', summary.tests.change, state.changeRun)
      : '',
  ].join('');

  body.innerHTML = `
    <div class="score-banner">
      <div class="score-value">${scoring.score}<small>/100</small></div>
      <div>
        <h3>${escapeHtml(scoring.grade)}</h3>
        <p>Base tests ${summary.tests.base.passed}/${summary.tests.base.total} · change tests ${summary.tests.change.passed}/${summary.tests.change.total} · ${state.hints.length} hint${state.hints.length === 1 ? '' : 's'} used · ${state.clarify.asked} clarifying question${state.clarify.asked === 1 ? '' : 's'}.</p>
      </div>
    </div>
    <div class="debrief-grid">
      <div class="debrief-card">
        <h3>Interviewer debrief ${narrativeBadge}</h3>
        <div class="narrative">${escapeHtml(narrative.text)}</div>
      </div>
      <div class="debrief-card">
        <h3>Rubric</h3>
        <table class="rubric-table">
          <thead><tr><th>Criterion</th><th>Weight</th><th>Earned</th><th>Result</th></tr></thead>
          <tbody>${rubricRows}</tbody>
        </table>
      </div>
    </div>
    <div class="debrief-grid">
      <div class="debrief-card">
        <h3>Missed criteria</h3>
        ${missed}
      </div>
      <div class="debrief-card">
        <h3>Time and hints</h3>
        <div class="metrics">
          ${phaseRows}
          <div class="metric-row"><span>Hints used</span><span>${escapeHtml(hintText)}</span></div>
          <div class="metric-row"><span>Probes seen</span><span>${summary.probesFired}</span></div>
          <div class="metric-row"><span>Phase time total</span><span>${duration(Object.values(state.elapsed).reduce((sum, value) => sum + value, 0))}</span></div>
        </div>
      </div>
    </div>
    <div class="debrief-grid">
      <div class="debrief-card">
        <h3>Clarifying questions coach</h3>
        <div class="coach-list">${clarifyRows}</div>
      </div>
      <div class="debrief-card">
        <h3>Final tests</h3>
        ${testsHtml}
      </div>
    </div>
    <details class="reference">
      <summary>Reveal the reference solution</summary>
      <pre>${escapeHtml(state.scenario.referenceSolution)}</pre>
    </details>
  `;
}

function renderTestSummary(label, summary, run) {
  const failures = (run?.results || []).filter((test) => !test.passed).map((test) => test.name);
  return `<div class="metric-row"><span>${escapeHtml(label)}</span><span>${summary.passed}/${summary.total} passing</span></div>
    ${failures.length ? `<p class="muted" style="margin-top:6px">Failed: ${escapeHtml(failures.join(', '))}</p>` : ''}`;
}

function topicStats(records) {
  const map = new Map();
  for (const record of records) {
    for (const topic of record.topics || []) {
      const entry = map.get(topic) || { topic, sessions: 0, total: 0 };
      entry.sessions += 1;
      entry.total += Number(record.score) || 0;
      map.set(topic, entry);
    }
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, average: entry.sessions ? entry.total / entry.sessions : 0 }))
    .sort((a, b) => a.average - b.average);
}

function recommendNext() {
  if (!state.scenario || !state.scenarios.length) return null;
  const current = state.scenario;
  const records = state.progress;
  const weak = topicStats(records)[0]?.topic;
  const played = (id) => records.filter((record) => record.scenarioId === id).length;
  const ranked = state.scenarios
    .filter((scenario) => scenario.id !== current.id)
    .map((scenario) => {
      let score = scenario.topics.filter((topic) => current.topics.includes(topic)).length * 3;
      if (weak && scenario.topics.includes(weak)) score += 4;
      score -= played(scenario.id) * 2;
      if (scenario.difficulty === current.difficulty) score += 1;
      return { scenario, score };
    })
    .sort((left, right) => right.score - left.score || left.scenario.title.localeCompare(right.scenario.title));
  return ranked[0]?.scenario || state.scenarios[0];
}

function retryScenario() {
  if (!state.scenario) return;
  const scenario = state.scenario;
  const minutes = { ...state.minutes };
  $('debriefDialog').close();
  startSession(scenario, minutes);
}

function startRecommended() {
  const next = recommendNext();
  if (!next) return;
  $('debriefDialog').close();
  startSession(next, next.phaseTimes);
}

function exitSession() {
  if (!state.active) return;
  if (!window.confirm('Leave this session? Only a completed debrief is saved to local progress.')) return;
  state.sessionToken += 1;
  state.active = false;
  state.running = false;
  if (state.ticker) clearInterval(state.ticker);
  state.ticker = null;
  $('sessionScreen').classList.add('hidden');
  $('setupScreen').classList.remove('hidden');
  $('exitBtn').classList.add('hidden');
  $('debriefDialog').close();
}

async function openHistory() {
  const body = $('historyBody');
  body.innerHTML = '<p class="muted">Loading local progress...</p>';
  $('historyDialog').showModal();
  try {
    const data = await api('/api/progress');
    state.progress = data.records;
    renderHistory(data.records);
  } catch (error) {
    body.innerHTML = `<p class="compile-fail">${escapeHtml(error.message)}</p>`;
  }
}

function renderHistory(records) {
  const body = $('historyBody');
  if (!records.length) {
    body.innerHTML = '<div class="empty-state">No completed sessions yet. Finish a debrief and the record will appear here.</div>';
    return;
  }
  const average = Math.round(records.reduce((sum, record) => sum + (Number(record.score) || 0), 0) / records.length);
  const stats = topicStats(records);
  const weakest = stats.slice(0, 4);

  const rows = records.map((record) => {
    const when = record.savedAt ? new Date(record.savedAt).toLocaleString() : 'unknown';
    const tests = record.tests || {};
    const base = tests.base ? `${tests.base.passed}/${tests.base.total}` : '-';
    const change = tests.change ? `${tests.change.passed}/${tests.change.total}` : '-';
    return `<tr>
      <td>${escapeHtml(when)}</td>
      <td>${escapeHtml(record.title || record.scenarioId)}</td>
      <td class="topics-cell">${escapeHtml((record.topics || []).join(', '))}</td>
      <td class="score-cell">${Number(record.score) || 0}</td>
      <td>${escapeHtml(base)} / ${escapeHtml(change)}</td>
      <td>${Number(record.hints?.length) || 0} hints</td>
      <td>${escapeHtml(record.mode === 'hybrid' ? 'AI' : 'Scripted')}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div class="history-summary">
      <div class="history-stat"><span>Sessions</span><strong>${records.length}</strong></div>
      <div class="history-stat"><span>Average score</span><strong>${average}</strong></div>
      <div class="history-stat"><span>Weakest topic</span><strong>${escapeHtml(weakest[0]?.topic || 'none yet')}</strong></div>
      <div class="history-stat"><span>Topics practised</span><strong>${stats.length}</strong></div>
    </div>
    <div class="debrief-card">
      <h3>Weakest topics</h3>
      <div class="weak-topics">
        ${weakest.map((entry) => `<span>${escapeHtml(entry.topic)} · ${Math.round(entry.average)} avg · ${entry.sessions} session${entry.sessions === 1 ? '' : 's'}</span>`).join('') || '<span>No topic data yet</span>'}
      </div>
    </div>
    <div class="debrief-card">
      <h3>Completed sessions</h3>
      <table class="history-table">
        <thead><tr><th>When</th><th>Scenario</th><th>Topics</th><th>Score</th><th>Base / change</th><th>Hints</th><th>Mode</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function bindEvents() {
  $('historyBtn').addEventListener('click', openHistory);
  $('exitBtn').addEventListener('click', exitSession);
  $('closeHistoryBtn').addEventListener('click', () => $('historyDialog').close());
  $('closeDebriefBtn').addEventListener('click', () => $('debriefDialog').close());
  $('retryBtn').addEventListener('click', retryScenario);
  $('nextScenarioBtn').addEventListener('click', startRecommended);
  $('startSessionBtn').addEventListener('click', () => {
    const scenario = state.pendingScenario;
    if (!scenario) return;
    const minutes = {};
    for (const input of $('phaseTimeFields').querySelectorAll('input')) {
      minutes[input.dataset.phase] = Number(input.value) || scenario.phaseTimes[input.dataset.phase] || 5;
    }
    startSession(scenario, minutes);
  });
  $('pauseBtn').addEventListener('click', togglePause);
  $('resetPhaseBtn').addEventListener('click', resetPhase);
  $('nextPhaseBtn').addEventListener('click', advancePhase);
  $('clarifyForm').addEventListener('submit', submitClarify);
  $('hintBtn').addEventListener('click', requestHint);
  $('probeBtn').addEventListener('click', requestProbe);
  $('runBtn').addEventListener('click', runTests);
  $('loadChangeBtn').addEventListener('click', loadChangeStarter);
  $('restoreCodeBtn').addEventListener('click', restoreCode);
  $('resetCodeBtn').addEventListener('click', resetCode);

  $('editor').addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const editor = $('editor');
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText('    ', start, end, 'end');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!state.runBusy && currentPhase() !== 'debrief') runTests();
    }
  });

  for (const id of ['briefingDialog', 'debriefDialog', 'historyDialog']) {
    const dialog = $(id);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
}

async function init() {
  bindEvents();
  try {
    const health = await api('/api/health');
    state.jdk = health.jdk;
    state.ai = health.ai;

    const list = await api('/api/scenarios');
    const details = await Promise.all(
      list.scenarios.map((summary) => api(`/api/scenarios/${encodeURIComponent(summary.id)}`).then((data) => data.scenario)),
    );
    state.scenarios = details;

    try {
      const progress = await api('/api/progress');
      state.progress = progress.records;
    } catch {
      state.progress = [];
    }

    renderStatus();
    renderScenarios();
  } catch (error) {
    showToast(`Could not load the simulator: ${error.message}`);
    $('scenarioGrid').innerHTML = `<div class="empty-state">The server did not answer. Start it with <code>node interview-sim/server.mjs</code> and reload.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
