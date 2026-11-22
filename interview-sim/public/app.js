import { criterionThreshold, gradeForPercentage, keywordCoverage } from './scoring.mjs';

const PHASE_SETS = {
  coding: [
    { key: 'brief', label: 'Brief & Clarify', short: 'Brief' },
    { key: 'implement', label: 'Implement', short: 'Code' },
    { key: 'test', label: 'Test', short: 'Test' },
    { key: 'change', label: 'Change Request', short: 'Change' },
    { key: 'debrief', label: 'Debrief', short: 'Debrief' },
  ],
  debugging: [
    { key: 'brief', label: 'Brief & Reproduce', short: 'Brief' },
    { key: 'implement', label: 'Diagnose', short: 'Diagnose' },
    { key: 'test', label: 'Fix & Verify', short: 'Fix' },
    { key: 'change', label: 'Harden', short: 'Harden' },
    { key: 'debrief', label: 'Debrief', short: 'Debrief' },
  ],
  design: [
    { key: 'brief', label: 'Brief & Clarify', short: 'Brief' },
    { key: 'implement', label: 'Design', short: 'Design' },
    { key: 'test', label: 'Review Sketch', short: 'Review' },
    { key: 'change', label: 'Constraint Change', short: 'Extend' },
    { key: 'debrief', label: 'Debrief', short: 'Debrief' },
  ],
};
const PHASES = PHASE_SETS.coding;

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
  candidateMessages: [],
  diagnosisText: '',
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
  runEpoch: 0,
  progressSaved: false,
  pendingRecord: null,
  sessionToken: 0,
  sessionId: null,
};

const exam = {
  active: false,
  questions: [],
  topics: [],
  answers: new Map(),
  index: 0,
  minutes: 25,
  durationSeconds: 25 * 60,
  remaining: 25 * 60,
  elapsed: 0,
  running: false,
  manualPause: false,
  pausedByVisibility: false,
  lastTick: 0,
  ticker: null,
  submitted: false,
  submitting: false,
  token: 0,
  focused: false,
  sessionId: null,
  report: null,
  record: null,
  timedOut: false,
  summaryText: '',
};

const AUTO_SPEAK_KEY = 'interview-sim.auto-speak';
const voice = {
  autoSpeak: false,
  recognition: null,
  recognitionConstructor: typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
    : null,
  listening: false,
  dictationBase: '',
  discardResults: false,
};

function speechSupported() {
  return typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis) &&
    typeof window.SpeechSynthesisUtterance === 'function';
}

function readStoredAutoSpeak() {
  try {
    return window.localStorage.getItem(AUTO_SPEAK_KEY) === '1';
  } catch {
    return false;
  }
}

function storeAutoSpeak(enabled) {
  try {
    window.localStorage.setItem(AUTO_SPEAK_KEY, enabled ? '1' : '0');
  } catch {}
}

function localVoice() {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  const local = voices.filter((item) => item.localService);
  return local.find((item) => /^en/i.test(item.lang)) || local[0] ||
    voices.find((item) => /^en/i.test(item.lang)) || voices[0] || null;
}

function cancelSpeech() {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {}
}

function speakText(text) {
  const content = String(text || '').trim();
  if (!content || !speechSupported()) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(content);
    utterance.rate = 1;
    utterance.pitch = 1;
    const selected = localVoice();
    if (selected) utterance.voice = selected;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

function speakIfAuto(text) {
  if (voice.autoSpeak) speakText(text);
}

function setVoiceNote(text) {
  const note = $('voiceStatus');
  if (note) note.textContent = text;
}

function updateVoiceUI() {
  const button = $('autoSpeakBtn');
  if (button) {
    const supported = speechSupported();
    button.disabled = !supported;
    button.setAttribute('aria-pressed', voice.autoSpeak ? 'true' : 'false');
    button.textContent = supported ? `Auto-speak: ${voice.autoSpeak ? 'on' : 'off'}` : 'Auto-speak unavailable';
    button.title = supported
      ? 'Speak each new interviewer message aloud'
      : 'Speech synthesis is not supported in this browser';
  }
  const briefButton = $('briefSpeakBtn');
  if (briefButton) {
    briefButton.disabled = !speechSupported();
    briefButton.title = speechSupported() ? 'Play the interviewer opening aloud' : 'Speech synthesis is not supported in this browser';
  }
}

function setAutoSpeak(enabled) {
  if (enabled && !speechSupported()) {
    voice.autoSpeak = false;
    updateVoiceUI();
    showToast('Speech synthesis is not supported in this browser, so interviewer messages stay text-only.');
    return;
  }
  voice.autoSpeak = Boolean(enabled);
  if (!voice.autoSpeak) cancelSpeech();
  storeAutoSpeak(voice.autoSpeak);
  updateVoiceUI();
}

function setDictationStatus(text) {
  const status = $('dictationStatus');
  if (status) status.textContent = text;
}

function updateMicUI(extraDisabled = false) {
  const button = $('micBtn');
  if (!button) return;
  const supported = Boolean(voice.recognitionConstructor);
  button.disabled = !supported || extraDisabled;
  button.setAttribute('aria-pressed', voice.listening ? 'true' : 'false');
  button.textContent = voice.listening ? 'Stop' : 'Mic';
  button.setAttribute('aria-label', voice.listening ? 'Stop dictation' : 'Start dictation');
  button.title = supported ? 'Dictate your question instead of typing' : 'Speech recognition is not supported in this browser';
}

function appendTranscript(base, addition) {
  const clean = String(addition || '').trim();
  if (!clean) return base;
  const separator = base && !/\s$/.test(base) ? ' ' : '';
  return `${base}${separator}${clean}`;
}

function setupRecognition() {
  if (!voice.recognitionConstructor) return null;
  if (voice.recognition) return voice.recognition;
  const recognition = new voice.recognitionConstructor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.onstart = () => {
    if (voice.discardResults) {
      try {
        recognition.stop();
      } catch {}
      return;
    }
    voice.listening = true;
    updateMicUI();
    setDictationStatus('Listening. Speak your question, then stop the microphone or press Ask when ready.');
  };
  recognition.onresult = (event) => {
    if (voice.discardResults) return;
    let interim = '';
    let final = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) final += transcript;
      else interim += transcript;
    }
    if (final) {
      voice.dictationBase = appendTranscript(voice.dictationBase, final);
      const input = $('clarifyInput');
      if (input) input.value = voice.dictationBase;
    }
    const shown = interim.trim();
    setDictationStatus(shown
      ? `Listening: ${shown}`
      : (final ? 'Dictation added. Review the text before asking.' : 'Listening...'));
  };
  recognition.onerror = (event) => {
    const messages = {
      'not-allowed': 'Microphone permission was denied. Allow microphone access or type your question instead.',
      'service-not-allowed': 'Speech recognition is not allowed in this browser context. Type your question instead.',
      'audio-capture': 'No microphone was found. Type your question instead.',
      'no-speech': 'No speech was heard. Try again when you are ready.',
      network: 'Speech recognition needs a network connection in this browser. Type your question instead.',
    };
    setDictationStatus(messages[event.error] || `Dictation stopped: ${event.error}. Type your question instead.`);
    voice.listening = false;
    updateMicUI();
  };
  recognition.onend = () => {
    const wasListening = voice.listening;
    voice.listening = false;
    updateMicUI();
    if (wasListening) setDictationStatus('Dictation stopped. Review the text, then press Ask when ready.');
  };
  voice.recognition = recognition;
  return recognition;
}

function stopDictation(silent = false, discard = false) {
  if (discard) voice.discardResults = true;
  if (!voice.recognition) return;
  const wasListening = voice.listening;
  voice.listening = false;
  try {
    voice.recognition.stop();
  } catch {}
  updateMicUI();
  if (wasListening && !silent) setDictationStatus('Dictation stopped. Review the text, then press Ask when ready.');
}

function toggleDictation() {
  if (!voice.recognitionConstructor) {
    setDictationStatus('Speech recognition is not supported in this browser. Type your question instead.');
    return;
  }
  const input = $('clarifyInput');
  if (!input || input.disabled) {
    setDictationStatus('Dictation is unavailable while the question field is locked.');
    return;
  }
  if (voice.listening) {
    stopDictation();
    return;
  }
  const recognition = setupRecognition();
  if (!recognition) return;
  voice.discardResults = false;
  voice.dictationBase = input.value;
  try {
    recognition.start();
  } catch {
    setDictationStatus('Dictation could not start. Type your question instead.');
  }
}


const $ = (id) => document.getElementById(id);

function newSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

function phasesFor(roundType) {
  return PHASE_SETS[roundType] || PHASE_SETS.coding;
}

function phaseList() {
  return phasesFor(state.scenario?.roundType);
}

function currentPhase() {
  return phaseList()[state.phaseIndex].key;
}

function activePhaseKeys() {
  return phaseList().filter((phase) => phase.key !== 'debrief').map((phase) => phase.key);
}

function roundTypeLabel(roundType) {
  if (roundType === 'debugging') return 'Debugging';
  if (roundType === 'design') return 'Design';
  return 'Coding';
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
  $('scenarioCount').textContent = String(state.scenarios.length || 12);
}

function renderScenarios() {
  const grid = $('scenarioGrid');
  grid.innerHTML = '';
  for (const scenario of state.scenarios) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'scenario-card';
    card.disabled = !state.jdk?.available && scenario.roundType !== 'design';
    card.dataset.scenarioId = scenario.id;
    card.dataset.roundType = scenario.roundType;

    const top = document.createElement('div');
    top.className = 'card-top';
    const roundType = document.createElement('span');
    roundType.className = `round-type ${scenario.roundType}`;
    roundType.textContent = roundTypeLabel(scenario.roundType);
    const difficulty = document.createElement('span');
    difficulty.className = 'difficulty';
    difficulty.textContent = scenario.difficulty;
    const time = document.createElement('span');
    time.className = 'card-time';
    time.textContent = `${totalPhaseMinutes(scenario.phaseTimes)} min`;
    top.append(roundType, difficulty, time);

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
    startText.textContent = state.jdk?.available
      ? 'Preview and start'
      : (scenario.roundType === 'design' ? 'Preview and start (no JDK needed)' : 'JDK required');
    const arrow = document.createElement('span');
    arrow.textContent = '->';
    start.append(startText, arrow);

    card.append(top, title, tagline, topics, start);
    card.addEventListener('click', () => openBriefing(scenario));
    grid.appendChild(card);
  }
}

function openBriefing(scenario) {
  cancelSpeech();
  state.pendingScenario = scenario;
  $('briefDifficulty').textContent = `${roundTypeLabel(scenario.roundType)} · ${scenario.difficulty} · ${scenario.topics.join(' · ')}`;
  $('briefTitle').textContent = scenario.title;
  $('briefTagline').textContent = scenario.tagline;
  $('briefIntro').textContent = scenario.intro;
  const briefSpeak = $('briefSpeakBtn');
  if (briefSpeak) {
    briefSpeak.disabled = !speechSupported();
    briefSpeak.title = speechSupported() ? 'Play the interviewer opening aloud' : 'Speech synthesis is not supported in this browser';
  }

  const extras = [];
  if (scenario.reproductionNote) {
    extras.push('### Reproduction note\n\n' + scenario.reproductionNote);
  }
  if (scenario.design?.constraints?.length) {
    extras.push('### Constraints\n\n' + scenario.design.constraints.map((item) => `- ${item}`).join('\n'));
  }
  $('briefProblem').innerHTML = renderMarkdown(
    scenario.problemStatement + (extras.length ? '\n\n' + extras.join('\n\n') : ''),
  );

  const fields = $('phaseTimeFields');
  fields.innerHTML = '';
  for (const phase of phasesFor(scenario.roundType)) {
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

  const design = scenario.roundType === 'design';
  const startBtn = $('startSessionBtn');
  startBtn.disabled = !state.jdk?.available && !design;
  startBtn.textContent = state.jdk?.available || design ? 'Start session' : 'Install a JDK first';
  $('briefJdkNote').textContent = design
    ? (state.jdk?.available
      ? `Detected ${state.jdk.version} via ${state.jdk.source}. A class sketch is compiled as an informational signal; design notes are enough.`
      : 'Design rounds need no JDK. Write design notes or a class sketch; a compiled sketch is informational only and does not affect the score.')
    : (state.jdk?.available
      ? `Detected ${state.jdk.version} via ${state.jdk.source}. Code is compiled with --release 17.`
      : 'No JDK detected. Follow the install steps on the previous screen, then restart the simulator.');

  $('briefingDialog').showModal();
}

function startSession(scenario, minutes) {
  if (!state.jdk?.available && scenario.roundType !== 'design') {
    showToast('A JDK is required before starting a coding or debugging session.');
    return;
  }
  state.scenario = scenario;
  state.minutes = { ...minutes };
  state.budgets = {};
  state.elapsed = {};
  for (const phase of phasesFor(scenario.roundType)) {
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
  state.candidateMessages = [];
  state.diagnosisText = '';
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
  state.runEpoch = 0;
  state.progressSaved = false;
  state.pendingRecord = null;
  state.sessionToken += 1;
  state.sessionId = newSessionId();

  $('scenarioTitle').textContent = scenario.title;
  $('scenarioDifficulty').textContent = `${roundTypeLabel(scenario.roundType)} · ${scenario.difficulty} · ${scenario.fileName}`;
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
  $('changeHelp').textContent = scenario.roundType === 'design'
    ? 'This is a constraint change or extension question, not a code delta. Answer it in your design notes.'
    : 'You can extend the code already in the editor, or load the change-request starter. Your implementation is saved if you switch.';
  $('changeCard').classList.add('hidden');
  $('editor').value = scenario.starterCode;

  $('reproductionCard').classList.toggle('hidden', !scenario.reproductionNote);
  $('reproductionNote').textContent = scenario.reproductionNote || '';
  $('diagnosisCard').classList.toggle('hidden', scenario.roundType !== 'debugging');
  $('diagnosisTitle').textContent = scenario.diagnosis?.prompt || 'Explain the root cause in your own words.';
  $('diagnosisInput').value = '';
  $('diagnosisInput').disabled = false;
  $('designCard').classList.toggle('hidden', scenario.roundType !== 'design');
  const constraints = $('designConstraints');
  constraints.innerHTML = '';
  for (const constraint of scenario.design?.constraints || []) {
    const item = document.createElement('li');
    item.textContent = constraint;
    constraints.appendChild(item);
  }

  $('chatLog').innerHTML = '';
  $('consoleOutput').innerHTML = scenario.roundType === 'design'
    ? '<p class="muted">Design notes do not need to compile. Press Check sketch to compile an optional class sketch; the result is informational.</p>'
    : '<p class="muted">Run the tests to see compile output and per-test results.</p>';
  $('consoleStatus').textContent = 'Not run yet';
  $('clarifyInput').value = '';
  $('clarifyInput').disabled = false;
  $('clarifyForm').querySelector('button[type="submit"]').disabled = false;
  stopDictation(true, true);
  cancelSpeech();
  setDictationStatus('');
  updateMicUI();
  $('restoreCodeBtn').classList.add('hidden');
  $('loadChangeBtn').classList.add('hidden');

  $('briefingDialog').close();
  $('debriefDialog').close();
  $('setupScreen').classList.add('hidden');
  $('sessionScreen').classList.remove('hidden');
  $('exitBtn').classList.remove('hidden');

  addMessage('interviewer', scenario.intro, { meta: 'Opening' });
  addMessage('interviewer', scenario.phasePrompts.brief, { meta: phasesFor(scenario.roundType)[0].label });
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
  const phases = phaseList();
  $('phaseLabel').textContent = phases[state.phaseIndex].label;
  const steps = $('phaseSteps');
  steps.innerHTML = '';
  phases.forEach((phase, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = phase.short;
    button.className = index === state.phaseIndex ? 'active' : (index < state.phaseIndex ? 'done' : '');
    button.addEventListener('click', () => jumpToPhase(index));
    steps.appendChild(button);
  });

  $('pauseBtn').textContent = state.running ? 'Pause' : 'Resume';
  $('nextPhaseBtn').textContent = state.phaseIndex >= phases.length - 1 ? 'Finish and debrief' : 'Next phase';
  const key = currentPhase();
  const design = state.scenario?.roundType === 'design';
  const hasChangeStarter = Boolean(state.scenario?.changeRequest?.starterCode);
  $('loadChangeBtn').classList.toggle('hidden', key !== 'change' || !hasChangeStarter);
  $('changeCard').classList.toggle('hidden', state.phaseIndex < 3);
  $('runBtn').disabled = state.runBusy || key === 'debrief';
  $('runBtn').textContent = state.runBusy
    ? 'Running...'
    : design
      ? 'Check sketch (optional)'
      : (key === 'change' ? 'Run change tests' : 'Run tests');
  const closed = key === 'debrief';
  if (closed) stopDictation(true, true);
  $('hintBtn').disabled = closed || state.hints.length >= (state.scenario?.hints?.length || 3);
  $('probeBtn').disabled = closed || state.probeBusy;
  $('clarifyInput').disabled = closed;
  $('clarifyForm').querySelector('button[type="submit"]').disabled = closed;
  updateMicUI(closed || state.clarifyBusy);
  $('resetPhaseBtn').disabled = closed;
  $('diagnosisCard').classList.toggle('hidden', state.scenario?.roundType !== 'debugging' || closed);
  $('diagnosisInput').disabled = closed;
  updateHintButton();
}

function addMessage(role, text, options = {}) {
  if (role === 'candidate' && text) {
    state.candidateMessages.push(String(text).slice(0, 4000));
    if (state.candidateMessages.length > 80) state.candidateMessages.shift();
  }
  const log = $('chatLog');
  const message = document.createElement('div');
  message.className = `message ${role}`;
  if (options.tone) message.classList.add(options.tone);
  if (options.typing) message.classList.add('typing');

  const head = document.createElement('div');
  head.className = 'message-head';
  if (options.meta) {
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = options.meta;
    if (options.source === 'ai') meta.classList.add('ai-source');
    head.appendChild(meta);
  }
  const speakable = role === 'interviewer' && Boolean(text) && !options.typing;
  if (speakable) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'message-speak';
    play.textContent = 'Play';
    play.setAttribute('aria-label', 'Play this interviewer message aloud');
    play.disabled = !speechSupported();
    if (!speechSupported()) play.title = 'Speech synthesis is not supported in this browser';
    play.addEventListener('click', () => speakText(text));
    head.appendChild(play);
  }
  if (head.childElementCount) message.appendChild(head);

  const body = document.createElement('span');
  body.textContent = text;
  message.appendChild(body);
  log.appendChild(message);
  log.scrollTop = log.scrollHeight;
  if (speakable) speakIfAuto(text);
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
  const phases = phaseList();
  const target = Math.max(0, Math.min(phases.length - 1, index));
  if (target === state.phaseIndex) {
    if (target === phases.length - 1) openDebrief();
    return;
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
    const design = state.scenario.roundType === 'design';
    const detail = design
      ? 'This is a constraint change, not a code delta: answer the extension question in your notes.'
      : 'The full statement and starter are in the card above the editor.';
    addMessage('interviewer', `Change request: ${state.scenario.changeRequest?.prompt || 'new scope'}. ${detail}`, {
      meta: design ? 'Constraint change' : 'Change request',
    });
  } else {
    addMessage('interviewer', state.scenario.phasePrompts[key], { meta: phases[target].label });
  }
  renderPhaseUI();
  renderTimer();
}

function advancePhase() {
  if (!state.active) return;
  const phases = phaseList();
  if (state.phaseIndex >= phases.length - 1) {
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
  addMessage('system', `${phaseList()[state.phaseIndex].label} timer reset.`);
}

async function submitClarify(event) {
  event.preventDefault();
  const input = $('clarifyInput');
  const question = input.value.trim();
  if (!question || state.clarifyBusy || currentPhase() === 'debrief') return;
  stopDictation(true, true);

  const token = state.sessionToken;
  state.clarifyBusy = true;
  input.disabled = true;
  $('clarifyForm').querySelector('button[type="submit"]').disabled = true;
  updateMicUI(true);
  addMessage('candidate', question, { meta: 'You' });
  state.clarify.asked += 1;
  updateClarifyCounter();
  input.value = '';
  const typing = addMessage('interviewer', 'Thinking...', { meta: 'Interviewer', typing: true });

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
        $('clarifyForm').querySelector('button[type="submit"]').disabled = false;
        input.focus();
      }
      updateMicUI(currentPhase() === 'debrief');
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
  if (!state.scenario?.changeRequest?.starterCode || state.phaseIndex < 3) return;
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
  const useChange = currentPhase() === 'change' && state.scenario.changeRequest?.starterCode;
  const source = useChange ? state.scenario.changeRequest.starterCode : state.scenario.starterCode;
  if (!window.confirm('Replace the editor contents with the starter code?')) return;
  $('editor').value = source;
  state.changeLoaded = Boolean(useChange);
  addMessage('system', 'Editor reset to the starter code.');
}

async function runTests() {
  if (state.runBusy || !state.scenario || currentPhase() === 'debrief') return;
  const token = state.sessionToken;
  const epoch = state.runEpoch;
  const set = currentPhase() === 'change' ? 'change' : 'base';
  state.runBusy = true;
  $('runBtn').disabled = true;
  $('runBtn').textContent = 'Running...';
  const design = state.scenario.roundType === 'design';
  const output = $('consoleOutput');
  output.innerHTML = `<p class="run-head">${design ? 'Checking the optional class sketch...' : `Running ${set === 'change' ? 'change-request' : 'base'} tests...`}</p>`;
  $('consoleStatus').textContent = 'Running';

  try {
    const result = await api('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: state.scenario.id, source: $('editor').value, phase: set }),
    });
    if (token !== state.sessionToken || epoch !== state.runEpoch) return;
    if (set === 'change') state.changeRun = result;
    else state.baseRun = result;
    renderConsole(result, set);
    if (design) {
      let message;
      if (!result.available) {
        message = 'No JDK is available, so the optional class sketch cannot be checked. Your design notes are still valid.';
      } else if (result.compiled) {
        message = 'Your class sketch compiles. This is informational only and does not affect your score.';
      } else if (result.sketch === 'notes') {
        message = 'No compiling class sketch found, so this is notes only. Design notes never need to compile; the sketch result is informational and does not affect your score.';
      } else {
        message = 'The sketch did not compile. Design notes are still valid; the sketch result is informational and does not affect your score.';
      }
      addMessage('interviewer', message, { meta: 'Sketch check' });
    } else if (!result.compiled) {
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
    if (token !== state.sessionToken || epoch !== state.runEpoch) return;
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

  if (result.design) {
    if (!result.available) {
      const note = document.createElement('p');
      note.className = 'compile-fail';
      note.textContent = result.compileOutput || 'No JDK available; a sketch cannot be checked.';
      output.appendChild(note);
      $('consoleStatus').textContent = 'Sketch check unavailable';
      return;
    }
    const head = document.createElement('p');
    head.className = 'run-head';
    const sketch = sketchStatusOf(result);
    head.textContent = sketch === 'compiled'
      ? 'Sketch check: compiled (informational)'
      : sketch === 'notes'
        ? 'Sketch check: no compiling class sketch found (notes only)'
        : 'Sketch check: did not compile (design notes are still valid)';
    output.appendChild(head);
    const detail = document.createElement('pre');
    detail.className = result.compiled ? 'test-detail ok' : 'test-detail';
    detail.textContent = result.compileOutput;
    output.appendChild(detail);
    $('consoleStatus').textContent = sketch === 'compiled'
      ? 'Sketch compiled · informational'
      : sketch === 'notes' ? 'Notes only · no class sketch' : 'Sketch did not compile · informational';
    return;
  }

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

async function runFinal(set, token, source) {
  try {
    const result = await api('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: state.scenario.id, source, phase: set }),
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

function sketchStatusOf(run) {
  if (run?.sketch) return run.sketch;
  if (run?.available === false) return 'unavailable';
  return run?.compiled ? 'compiled' : 'notes';
}

function sketchStatusLabel(run) {
  const status = sketchStatusOf(run);
  if (status === 'unavailable') return 'not checked, no JDK';
  if (status === 'compiled') return 'compiled';
  if (status === 'notes') return 'notes only, no class sketch';
  return 'did not compile';
}

function summarizeRun(result) {
  if (result?.design) {
    return {
      passed: 0,
      total: 0,
      compiled: Boolean(result.compiled),
      available: Boolean(result.available),
      sketch: sketchStatusOf(result),
      design: true,
    };
  }
  if (!result?.compiled) return { passed: 0, total: result?.results?.length || 0, compiled: false };
  return {
    passed: result.results.filter((test) => test.passed).length,
    total: result.results.length,
    compiled: true,
  };
}

function designEvidenceText() {
  return [state.diagnosisText, $('editor').value, ...state.candidateMessages].join('\n');
}

function diagnosisEvidenceText() {
  const typed = $('diagnosisInput') ? $('diagnosisInput').value : '';
  return [state.diagnosisText, typed, ...state.candidateMessages].join('\n');
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
  const sources = {
    tests: baseRatio,
    change: changeRatio,
    clarify: clarifyRatio,
    hints: hintRatio,
    efficiency,
  };
  const evidence = designEvidenceText();
  const diagnosis = diagnosisEvidenceText();

  const criteria = state.scenario.rubric.map((item) => {
    let value;
    let coverage = null;
    if (item.type === 'notes') {
      coverage = keywordCoverage(evidence, item.keywords || []);
      value = coverage.value;
    } else if (item.type === 'diagnosis') {
      coverage = keywordCoverage(diagnosis, state.scenario.diagnosis?.keywords || []);
      value = coverage.value;
    } else {
      value = sources[item.type] ?? 0;
    }
    const threshold = criterionThreshold(item.type);
    return {
      ...item,
      value,
      coverage,
      earned: Math.round(item.weight * value * 10) / 10,
      met: value >= threshold,
    };
  });
  const score = Math.round(criteria.reduce((sum, item) => sum + item.earned, 0));
  const missed = criteria.filter((item) => !item.met).map((item) => item.criterion);
  const grade = gradeForPercentage(score);
  return {
    score,
    grade,
    criteria,
    missed,
    baseRatio,
    changeRatio,
    clarifyRatio,
    hintRatio,
    efficiency,
    diagnosis: state.scenario.roundType === 'debugging'
      ? keywordCoverage(diagnosis, state.scenario.diagnosis?.keywords || [])
      : null,
  };
}

function buildSummary(scoring) {
  return {
    roundType: state.scenario.roundType,
    score: scoring.score,
    grade: scoring.grade,
    tests: { base: summarizeRun(state.baseRun), change: summarizeRun(state.changeRun) },
    diagnosis: scoring.diagnosis,
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

async function saveProgress(token) {
  if (state.progressSaved || !state.pendingRecord) return;
  try {
    const saved = await api('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: state.pendingRecord }),
    });
    if (token !== state.sessionToken) return;
    state.progress.unshift(saved.record);
    state.pendingRecord = null;
    state.progressSaved = true;
  } catch (error) {
    if (token === state.sessionToken) showToast(`Could not save progress: ${error.message}`);
  }
}

async function openDebrief() {
  if (!state.active || state.debriefRunning) return;
  if (state.debriefRendered) {
    $('debriefDialog').showModal();
    await saveProgress(state.sessionToken);
    return;
  }
  state.debriefRunning = true;
  state.runEpoch += 1;
  const token = state.sessionToken;
  const source = $('editor').value;
  state.running = false;
  state.phaseIndex = phaseList().length - 1;
  renderPhaseUI();
  renderTimer();
  const design = state.scenario.roundType === 'design';
  if (!state.debriefPrompted) {
    state.debriefPrompted = true;
    addMessage('interviewer', state.scenario.phasePrompts.debrief, { meta: 'Debrief' });
    addMessage('system', design
      ? 'Checking whether the class sketch compiles (informational), then scoring the design rubric.'
      : 'Running the hidden tests against your final code, then scoring the rubric.');
  }

  const body = $('debriefBody');
  body.innerHTML = design
    ? '<p class="muted">Checking the optional class sketch and scoring your design notes...</p>'
    : '<p class="muted">Running the final hidden tests against your code...</p>';
  $('debriefTitle').textContent = `${state.scenario.title} · debrief`;
  $('debriefDialog').showModal();

  const base = await runFinal('base', token, source);
  if (token !== state.sessionToken) return;
  const change = !design && state.scenario.changeRequest
    ? await runFinal('change', token, source)
    : null;
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
    sessionId: state.sessionId,
    roundType: state.scenario.roundType,
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
      type: item.type,
      coverage: item.coverage ? { matched: item.coverage.matched, total: item.coverage.total } : null,
    })),
    missed: scoring.missed,
    diagnosis: scoring.diagnosis,
    tests: summary.tests,
    phaseSeconds: state.elapsed,
    phaseBudgets: state.budgets,
    hints: state.hints,
    clarify: summary.clarify,
    probesFired: state.probesSeen.length,
    mode: summary.mode,
    aiNarrativeSource: narrative.source,
  };

  state.pendingRecord = record;
  await saveProgress(token);
  if (token !== state.sessionToken) return;

  renderDebrief(scoring, summary, narrative);
  state.debriefRendered = true;
  state.debriefRunning = false;
}

function renderDebrief(scoring, summary, narrative) {
  const body = $('debriefBody');
  const design = state.scenario.roundType === 'design';
  const debugging = state.scenario.roundType === 'debugging';
  const narrativeBadge = narrative.source === 'ai'
    ? '<span class="source-badge ai">AI interviewer</span>'
    : '<span class="source-badge scripted">Scripted fallback</span>';

  const rubricRows = scoring.criteria.map((item) => {
    const evidence = item.coverage
      ? `<span class="strong">Matches ${item.coverage.matched}/${item.coverage.total} evidence signals</span>`
      : '';
    return `
    <tr>
      <td>${escapeHtml(item.criterion)}<span class="strong">${escapeHtml(item.strongAnswer)}</span>${evidence}</td>
      <td>${item.weight}</td>
      <td>${item.earned}</td>
      <td class="${item.met ? 'met' : 'missed'}">${item.met ? 'Strong' : 'Below bar'}</td>
    </tr>`;
  }).join('');

  const missed = scoring.missed.length
    ? `<ul class="missed-list">${scoring.missed.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="muted">Every rubric criterion reached the strong band.</p>';

  const phaseRows = phaseList().map((phase) => {
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

  const sketchStatus = sketchStatusLabel(summary.tests.base);

  const testsHtml = design
    ? `<div class="metric-row"><span>Sketch check (informational)</span><span>${sketchStatus}</span></div>
       <p class="muted">Design notes never need to compile. The sketch result is informational and does not affect the score.</p>`
    : [
        renderTestSummary('Base tests', summary.tests.base, state.baseRun),
        state.scenario.changeRequest
          ? renderTestSummary('Change request', summary.tests.change, state.changeRun)
          : '',
      ].join('');

  const evidenceLine = design
    ? `${roundTypeLabel(state.scenario.roundType)} round · sketch ${sketchStatus} (informational) · ${state.hints.length} hint${state.hints.length === 1 ? '' : 's'} used · ${state.clarify.asked} clarifying question${state.clarify.asked === 1 ? '' : 's'}.`
    : debugging
      ? `Base tests ${summary.tests.base.passed}/${summary.tests.base.total} · diagnosis ${scoring.diagnosis?.matched ?? 0}/${scoring.diagnosis?.total ?? 0} signals · change tests ${summary.tests.change.passed}/${summary.tests.change.total} · ${state.hints.length} hint${state.hints.length === 1 ? '' : 's'} used.`
      : `Base tests ${summary.tests.base.passed}/${summary.tests.base.total} · change tests ${summary.tests.change.passed}/${summary.tests.change.total} · ${state.hints.length} hint${state.hints.length === 1 ? '' : 's'} used · ${state.clarify.asked} clarifying question${state.clarify.asked === 1 ? '' : 's'}.`;

  const reference = design
    ? `<details class="reference">
        <summary>Reveal the reference design</summary>
        <pre>${escapeHtml(state.scenario.referenceDesign || '')}</pre>
      </details>`
    : `<details class="reference">
        <summary>Reveal the reference solution</summary>
        <pre>${escapeHtml(state.scenario.referenceSolution || '')}</pre>
      </details>`;

  body.innerHTML = `
    <div class="score-banner">
      <div class="score-value">${scoring.score}<small>/100</small></div>
      <div>
        <h3>${escapeHtml(scoring.grade)}</h3>
        <p>${escapeHtml(evidenceLine)}</p>
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
        <h3>${design ? 'Sketch check' : 'Final tests'}</h3>
        ${testsHtml}
      </div>
    </div>
    ${reference}
  `;
}

function renderTestSummary(label, summary, run) {
  const failures = (run?.results || []).filter((test) => !test.passed).map((test) => test.name);
  return `<div class="metric-row"><span>${escapeHtml(label)}</span><span>${summary.passed}/${summary.total} passing</span></div>
    ${failures.length ? `<p class="muted" style="margin-top:6px">Failed: ${escapeHtml(failures.join(', '))}</p>` : ''}`;
}

function uniqueRecords(records) {
  const seen = new Set();
  const unique = [];
  for (const record of records) {
    const key = record.sessionId || record.id || null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    unique.push(record);
  }
  return unique;
}

function topicStats(records) {
  const map = new Map();
  for (const record of uniqueRecords(records)) {
    if (record.kind === 'exam' && Array.isArray(record.topicBreakdown)) {
      for (const topic of record.topicBreakdown) {
        const entry = map.get(topic.name) || { topic: topic.name, sessions: 0, total: 0 };
        entry.sessions += 1;
        entry.total += Number(topic.percentage) || 0;
        map.set(topic.name, entry);
      }
      continue;
    }
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
  const records = uniqueRecords(state.progress);
  const weak = topicStats(records)[0]?.topic;
  const played = (id) => records.filter((record) => record.scenarioId === id).length;
  const ranked = state.scenarios
    .filter((scenario) => scenario.id !== current.id)
    .map((scenario) => {
      let score = scenario.topics.filter((topic) => current.topics.includes(topic)).length * 3;
      if (weak && scenario.topics.includes(weak)) score += 4;
      score -= played(scenario.id) * 2;
      if (scenario.roundType !== current.roundType) score += 2;
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
  startSession(scenario, minutes);
}

function startRecommended() {
  const next = recommendNext();
  if (!next) return;
  startSession(next, next.phaseTimes);
}

function endScenarioSession() {
  state.sessionToken += 1;
  state.active = false;
  state.running = false;
  if (state.ticker) clearInterval(state.ticker);
  state.ticker = null;
  stopDictation(true, true);
  cancelSpeech();
  setDictationStatus('');
  $('sessionScreen').classList.add('hidden');
  $('setupScreen').classList.remove('hidden');
  $('exitBtn').classList.add('hidden');
  $('debriefDialog').close();
}

function exitSession() {
  if (!state.active) return;
  if (!window.confirm('Leave this session? Only a completed debrief is saved to local progress.')) return;
  endScenarioSession();
}

function clampExamMinutes(value, fallback = 25) {
  if (value === '' || value === null || value === undefined) return fallback;
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return fallback;
  return Math.max(5, Math.min(120, Math.round(minutes)));
}

function examTopicName(topicId) {
  return exam.topics.find((topic) => topic.id === topicId)?.name || topicId;
}

function startExamTicker() {
  stopExamTicker();
  exam.ticker = setInterval(tickExam, 250);
}

function stopExamTicker() {
  if (exam.ticker) clearInterval(exam.ticker);
  exam.ticker = null;
}

function renderExamTimer() {
  const value = $('examTimerValue');
  if (!value) return;
  value.textContent = clock(exam.remaining, false);
  value.classList.toggle('low', exam.remaining <= 60);
}

function renderExamProgress() {
  const total = exam.questions.length;
  const answered = exam.answers.size;
  $('examProgressLabel').textContent = total
    ? `Question ${exam.index + 1} of ${total} · ${answered} answered`
    : 'No questions';
  const fill = $('examProgressBar');
  if (fill) fill.style.width = total ? `${((exam.index + 1) / total) * 100}%` : '0%';
}

function renderExamNav() {
  const last = exam.questions.length - 1;
  $('examPrevBtn').disabled = exam.index <= 0;
  $('examNextBtn').disabled = exam.index >= last;
  $('examPauseBtn').textContent = exam.running ? 'Pause' : 'Resume';
  $('examPauseBtn').disabled = exam.submitted;
  $('examSubmitBtn').disabled = exam.submitted || exam.submitting;
  $('examSubmitBtn').textContent = exam.submitting ? 'Submitting...' : 'Submit exam';
}

function renderExamQuestion() {
  const question = exam.questions[exam.index];
  if (!question) return;
  $('examLegend').textContent = `Question ${exam.index + 1}. ${question.prompt}`;
  const holder = $('examOptions');
  holder.innerHTML = '';
  question.options.forEach((text, index) => {
    const label = document.createElement('label');
    label.className = 'exam-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'exam-option';
    input.value = String(index);
    input.checked = exam.answers.get(question.id) === index;
    input.addEventListener('change', () => {
      exam.answers.set(question.id, index);
      $('examQuestionMeta').textContent = examQuestionMeta(question);
      renderExamProgress();
    });
    const span = document.createElement('span');
    span.textContent = text;
    label.append(input, span);
    holder.appendChild(label);
  });
  $('examQuestionMeta').textContent = examQuestionMeta(question);
  renderExamProgress();
  renderExamNav();
}

function examQuestionMeta(question) {
  const kind = question.type === 'true-false' ? 'True / false' : 'Multiple choice';
  const answered = exam.answers.has(question.id) ? 'Answer saved' : 'Not answered yet';
  return `${examTopicName(question.topic)} · ${kind} · ${answered}`;
}

function goToExamQuestion(index) {
  if (!exam.active || exam.submitted) return;
  exam.index = Math.max(0, Math.min(exam.questions.length - 1, index));
  renderExamQuestion();
}

function toggleExamPause() {
  if (!exam.active || exam.submitted) return;
  if (exam.running) {
    exam.running = false;
    exam.manualPause = true;
    exam.pausedByVisibility = false;
    $('examTimerNote').textContent = 'Timer paused.';
  } else {
    exam.running = true;
    exam.manualPause = false;
    exam.pausedByVisibility = false;
    exam.lastTick = performance.now();
    $('examTimerNote').textContent = 'Timer resumed.';
  }
  renderExamNav();
}

function tickExam() {
  if (!exam.active || !exam.running || exam.submitted) return;
  const now = performance.now();
  const delta = Math.max(0, (now - exam.lastTick) / 1000);
  exam.lastTick = now;
  exam.elapsed += delta;
  exam.remaining = Math.max(0, exam.remaining - delta);
  renderExamTimer();
  if (exam.remaining <= 0) {
    exam.running = false;
    $('examTimerNote').textContent = 'Time is up. Your exam was submitted automatically.';
    submitExam({ timedOut: true });
  }
}

async function startExam({ ids = null, minutes = 25 } = {}) {
  if (exam.submitting) return;
  if (exam.active && !exam.submitted && !window.confirm('Replace the exam in progress? Your answers will not be saved.')) return;
  const query = ids && ids.length ? `?ids=${ids.map((id) => encodeURIComponent(id)).join(',')}` : '';
  let data;
  try {
    data = await api(`/api/exam${query}`);
  } catch (error) {
    showToast(error.message);
    return;
  }
  if (!data.questions?.length) {
    showToast('No exam questions were available.');
    return;
  }

  if (state.active) {
    if (!window.confirm('Leave this session? Only a completed debrief is saved to local progress.')) return;
    endScenarioSession();
  }

  stopExamTicker();
  stopDictation(true, true);
  cancelSpeech();
  exam.token += 1;
  exam.active = true;
  exam.questions = data.questions;
  exam.topics = data.topics || [];
  exam.answers = new Map();
  exam.index = 0;
  exam.minutes = clampExamMinutes(minutes, data.defaultMinutes || 25);
  exam.durationSeconds = exam.minutes * 60;
  exam.remaining = exam.durationSeconds;
  exam.elapsed = 0;
  exam.running = true;
  exam.manualPause = false;
  exam.pausedByVisibility = false;
  exam.lastTick = performance.now();
  exam.submitted = false;
  exam.submitting = false;
  exam.focused = Boolean(ids && ids.length);
  exam.sessionId = newSessionId();
  exam.report = null;
  exam.record = null;
  exam.timedOut = false;
  exam.summaryText = '';

  $('examTitle').textContent = exam.focused
    ? `Focused retake: ${data.count} question${data.count === 1 ? '' : 's'}`
    : `${data.count}-question exam`;
  $('examStatusLine').textContent = exam.focused
    ? 'Only the questions you missed last time. Answer each one, then submit.'
    : 'Answer every question, then submit. Answers stay hidden until the report.';
  $('examTimerNote').textContent = '';
  $('setupScreen').classList.add('hidden');
  $('sessionScreen').classList.add('hidden');
  $('examScreen').classList.remove('hidden');
  $('exitBtn').classList.add('hidden');
  $('examReportDialog').close();
  $('historyDialog').close();
  $('briefingDialog').close();

  renderExamQuestion();
  renderExamTimer();
  startExamTicker();
}

async function submitExam({ timedOut = false } = {}) {
  if (!exam.active || exam.submitted || exam.submitting) return;
  const token = exam.token;
  const wasRunning = exam.running;
  exam.submitting = true;
  exam.submitted = true;
  exam.running = false;
  exam.timedOut = exam.timedOut || Boolean(timedOut);
  stopExamTicker();
  renderExamNav();

  const questionIds = exam.questions.map((question) => question.id);
  const answers = [...exam.answers.entries()].map(([id, selected]) => ({ id, selected }));
  try {
    const report = await api('/api/exam/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionIds, answers }),
    });
    if (token !== exam.token) return;
    exam.report = report;
    const record = {
      kind: 'exam',
      scenarioId: 'exam',
      sessionId: exam.sessionId,
      title: exam.focused ? `Focused retake (${report.total} questions)` : `Exam (${report.total} questions)`,
      examMode: exam.focused ? 'focused' : 'standard',
      score: report.percentage,
      percentage: report.percentage,
      correct: report.correct,
      total: report.total,
      grade: report.grade,
      topics: report.topicBreakdown.map((topic) => topic.name),
      topicBreakdown: report.topicBreakdown,
      missedQuestionIds: report.missed.map((item) => item.id),
      plan: report.plan,
      questionIds,
      durationSeconds: exam.durationSeconds,
      elapsedSeconds: Math.round(exam.elapsed),
      timedOut: exam.timedOut,
      mode: 'scripted',
    };
    exam.record = record;
    try {
      const saved = await api('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record }),
      });
      if (token !== exam.token) return;
      state.progress.unshift(saved.record);
    } catch (error) {
      if (token === exam.token) showToast(`Could not save exam progress: ${error.message}`);
    }
    if (token !== exam.token) return;
    renderExamReport(report, { timedOut: exam.timedOut });
    $('examResultAnnouncement').textContent = '';
    $('examReportDialog').showModal();
    $('examResultAnnouncement').textContent = exam.summaryText;
  } catch (error) {
    if (token !== exam.token) return;
    exam.submitted = false;
    if (!exam.timedOut && exam.remaining > 0) {
      exam.running = wasRunning;
      exam.lastTick = performance.now();
      startExamTicker();
    }
    $('examTimerNote').textContent = `Submission failed: ${error.message}. You can try submitting again.`;
    showToast(error.message);
  } finally {
    if (token === exam.token) {
      exam.submitting = false;
      renderExamNav();
    }
  }
}

function examSummaryText(report, { timedOut = false } = {}) {
  const areas = report.topicBreakdown
    .filter((topic) => topic.correct < topic.total)
    .map((topic) => topic.name);
  const lead = timedOut ? 'Time expired, so the exam was submitted automatically. ' : '';
  const areaText = areas.length ? `Areas to work on: ${areas.join(', ')}.` : 'No areas were done incorrectly.';
  const first = report.plan?.[0];
  const focus = first ? `The tailored plan starts with ${first.name}, where ${first.missedCount} question${first.missedCount === 1 ? ' was' : 's were'} missed.` : '';
  return `${lead}You scored ${report.correct} out of ${report.total}, ${report.percentage} percent. Grade: ${report.grade}. ${areaText} ${focus}`
    .replace(/\s+/g, ' ')
    .trim();
}

function renderExamReport(report, { timedOut = false } = {}) {
  const areas = report.topicBreakdown.filter((topic) => topic.correct < topic.total);
  const areasHtml = areas.length
    ? `<ul class="exam-areas">${areas.map((topic) => `<li>${escapeHtml(topic.name)}: ${topic.total - topic.correct} incorrect of ${topic.total} (${topic.percentage}%)</li>`).join('')}</ul>`
    : '<p class="muted">No topic was done incorrectly.</p>';

  const topicRows = report.topicBreakdown.map((topic) => `
    <tr>
      <td>${escapeHtml(topic.name)}</td>
      <td class="numeric">${topic.correct}/${topic.total}</td>
      <td class="numeric">${topic.percentage}%</td>
    </tr>`).join('');

  const planHtml = report.plan.length
    ? `<ol class="exam-plan">${report.plan.map((item) => `
      <li>
        <div class="exam-plan-head">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${item.missedCount} missed · ${item.accuracy}% correct</span>
        </div>
        <ul>${item.missed.map((missed) => `<li>${escapeHtml(missed.prompt)}</li>`).join('')}</ul>
      </li>`).join('')}</ol>`
    : '<p class="muted">No missed questions, so no remediation plan is needed.</p>';

  const missedHtml = report.missed.length
    ? `<div class="exam-miss-list">${report.missed.map((item) => `
      <article class="exam-miss">
        <h4>${escapeHtml(item.prompt)}</h4>
        <div class="exam-miss-rows">
          <div class="exam-miss-row"><span>Topic</span><span>${escapeHtml(item.topicName)}</span></div>
          <div class="exam-miss-row"><span>Your answer</span><span class="wrong">${item.selectedAnswer === null ? 'No answer' : escapeHtml(item.selectedAnswer)}</span></div>
          <div class="exam-miss-row"><span>Correct answer</span><span class="right">${escapeHtml(item.correctAnswer)}</span></div>
        </div>
        <p>${escapeHtml(item.explanation)}</p>
      </article>`).join('')}</div>`
    : '<p class="muted">Every question was correct.</p>';

  const summary = examSummaryText(report, { timedOut });
  exam.summaryText = summary;
  $('examResultAnnouncement').textContent = summary;
  $('examReportTitle').textContent = exam.focused ? 'Focused retake result' : 'Exam result';
  $('examReportBody').innerHTML = `
    <div class="score-banner">
      <div class="score-value">${report.percentage}<small>%</small></div>
      <div>
        <h3>${escapeHtml(report.grade)}</h3>
        <p>${escapeHtml(summary)}</p>
      </div>
    </div>
    <div class="debrief-grid">
      <div class="debrief-card">
        <h3>Areas done incorrectly</h3>
        ${areasHtml}
      </div>
      <div class="debrief-card">
        <h3>Per-topic breakdown</h3>
        <table class="exam-topic-table">
          <thead><tr><th>Topic</th><th>Correct</th><th>Score</th></tr></thead>
          <tbody>${topicRows}</tbody>
        </table>
        <p class="muted" style="margin-top:8px">${report.correct} of ${report.total} correct overall.</p>
      </div>
    </div>
    <div class="debrief-card">
      <h3>Tailored remediation plan</h3>
      ${planHtml}
    </div>
    <div class="debrief-card">
      <h3>Every incorrect answer</h3>
      ${missedHtml}
    </div>
  `;
  $('examRetakeMissedBtn').disabled = report.missed.length === 0;
  const speakButton = $('examSpeakBtn');
  speakButton.disabled = !speechSupported();
  speakButton.textContent = speechSupported() ? 'Play feedback summary' : 'Speech unavailable';
  speakButton.title = speechSupported() ? 'Read the exam feedback summary aloud' : 'Speech synthesis is not supported in this browser';
  speakIfAuto(summary);
}

function exitExam() {
  cancelSpeech();
  if (!exam.active) {
    $('examReportDialog').close();
    return;
  }
  if (!exam.submitted && !window.confirm('Leave the exam? Your answers will not be saved.')) return;
  exam.token += 1;
  stopExamTicker();
  stopDictation(true, true);
  exam.active = false;
  exam.running = false;
  exam.submitted = false;
  exam.submitting = false;
  $('examReportDialog').close();
  $('examScreen').classList.add('hidden');
  $('setupScreen').classList.remove('hidden');
  $('exitBtn').classList.add('hidden');
  setDictationStatus('');
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
  const unique = uniqueRecords(records);
  if (!unique.length) {
    body.innerHTML = '<div class="empty-state">No completed sessions or exams yet. Finish a debrief or submit an exam and the record will appear here.</div>';
    return;
  }
  const exams = unique.filter((record) => record.kind === 'exam');
  const sessions = unique.filter((record) => record.kind !== 'exam');
  const average = sessions.length
    ? Math.round(sessions.reduce((sum, record) => sum + (Number(record.score) || 0), 0) / sessions.length)
    : 0;
  const stats = topicStats(unique);
  const weakest = stats.slice(0, 4);

  const rows = sessions.map((record) => {
    const when = record.savedAt ? new Date(record.savedAt).toLocaleString() : 'unknown';
    const tests = record.tests || {};
    const base = tests.base ? `${tests.base.passed}/${tests.base.total}` : '-';
    const change = tests.change ? `${tests.change.passed}/${tests.change.total}` : '-';
    const testsCell = record.roundType === 'design'
      ? sketchStatusLabel(tests.base)
      : `${base} / ${change}`;
    return `<tr>
      <td>${escapeHtml(when)}</td>
      <td>${escapeHtml(roundTypeLabel(record.roundType))}</td>
      <td>${escapeHtml(record.title || record.scenarioId)}</td>
      <td class="topics-cell">${escapeHtml((record.topics || []).join(', '))}</td>
      <td class="score-cell">${Number(record.score) || 0}</td>
      <td>${escapeHtml(testsCell)}</td>
      <td>${Number(record.hints?.length) || 0} hints</td>
      <td>${escapeHtml(record.mode === 'hybrid' ? 'AI' : 'Scripted')}</td>
    </tr>`;
  }).join('');

  const examRows = exams.map((record) => {
    const when = record.savedAt ? new Date(record.savedAt).toLocaleString() : 'unknown';
    const areas = (record.plan || []).map((item) => item.name).join(', ') || 'none';
    return `<tr>
      <td>${escapeHtml(when)}</td>
      <td>${escapeHtml(record.examMode === 'focused' ? 'Focused retake' : 'Exam')}</td>
      <td>${Number(record.correct) || 0}/${Number(record.total) || 0}</td>
      <td class="score-cell">${Number(record.percentage ?? record.score) || 0}%</td>
      <td>${escapeHtml(record.grade || '')}</td>
      <td class="topics-cell">${escapeHtml(areas)}</td>
    </tr>`;
  }).join('');

  const latestExam = exams[0];
  const latestPlan = latestExam?.plan?.length
    ? `<div class="debrief-card">
        <h3>Latest tailored plan · ${escapeHtml(latestExam.title || 'Exam')}</h3>
        <ol class="exam-plan">
          ${latestExam.plan.map((item) => `
            <li>
              <div class="exam-plan-head">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${item.missedCount} missed · ${item.accuracy}% correct</span>
              </div>
              <ul>${(item.missed || []).map((missed) => `<li>${escapeHtml(missed.prompt)}</li>`).join('')}</ul>
            </li>`).join('')}
        </ol>
        <div class="debrief-actions">
          <button id="startPlanRetakeBtn" type="button" class="primary">Start focused retake</button>
        </div>
      </div>`
    : (latestExam ? `<div class="debrief-card">
        <h3>Latest tailored plan</h3>
        <p class="muted">The latest exam had no missed questions, so no focused retake is needed.</p>
      </div>` : '');

  body.innerHTML = `
    <div class="history-summary">
      <div class="history-stat"><span>Sessions</span><strong>${sessions.length}</strong></div>
      <div class="history-stat"><span>Exams</span><strong>${exams.length}</strong></div>
      <div class="history-stat"><span>Average session score</span><strong>${average}</strong></div>
      <div class="history-stat"><span>Weakest topic</span><strong>${escapeHtml(weakest[0]?.topic || 'none yet')}</strong></div>
    </div>
    <div class="debrief-card">
      <h3>Weakest topics</h3>
      <div class="weak-topics">
        ${weakest.map((entry) => `<span>${escapeHtml(entry.topic)} · ${Math.round(entry.average)} avg · ${entry.sessions} record${entry.sessions === 1 ? '' : 's'}</span>`).join('') || '<span>No topic data yet</span>'}
      </div>
    </div>
    ${exams.length ? `<div class="debrief-card">
      <h3>Exam attempts</h3>
      <table class="history-table">
        <thead><tr><th>When</th><th>Type</th><th>Correct</th><th>Score</th><th>Grade</th><th>Areas done incorrectly</th></tr></thead>
        <tbody>${examRows}</tbody>
      </table>
    </div>` : ''}
    ${latestPlan}
    ${sessions.length ? `<div class="debrief-card">
      <h3>Completed sessions</h3>
      <table class="history-table">
        <thead><tr><th>When</th><th>Type</th><th>Scenario</th><th>Topics</th><th>Score</th><th>Tests / sketch</th><th>Hints</th><th>Mode</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : ''}
  `;

  const retake = $('startPlanRetakeBtn');
  if (retake && latestExam) {
    const ids = latestExam.missedQuestionIds || [];
    const minutes = latestExam.durationSeconds
      ? Math.round(latestExam.durationSeconds / 60)
      : 25;
    retake.disabled = ids.length === 0;
    retake.addEventListener('click', () => {
      $('historyDialog').close();
      startExam({ ids, minutes });
    });
  }
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
  $('micBtn').addEventListener('click', toggleDictation);
  $('autoSpeakBtn').addEventListener('click', () => setAutoSpeak(!voice.autoSpeak));
  $('briefSpeakBtn').addEventListener('click', () => {
    if (state.pendingScenario) speakText(state.pendingScenario.intro);
  });
  $('startExamBtn').addEventListener('click', () => {
    const minutes = clampExamMinutes($('examMinutes').value, 25);
    startExam({ minutes });
  });
  $('examPrevBtn').addEventListener('click', () => goToExamQuestion(exam.index - 1));
  $('examNextBtn').addEventListener('click', () => goToExamQuestion(exam.index + 1));
  $('examPauseBtn').addEventListener('click', toggleExamPause);
  $('examSubmitBtn').addEventListener('click', () => submitExam());
  $('examExitBtn').addEventListener('click', exitExam);
  $('closeExamReportBtn').addEventListener('click', exitExam);
  $('examBackToSetupBtn').addEventListener('click', exitExam);
  $('examSpeakBtn').addEventListener('click', () => {
    if (exam.summaryText) speakText(exam.summaryText);
  });
  $('examRetakeMissedBtn').addEventListener('click', () => {
    const ids = (exam.report?.missed || []).map((item) => item.id);
    if (!ids.length) return;
    startExam({ ids, minutes: exam.minutes });
  });
  $('hintBtn').addEventListener('click', requestHint);
  $('probeBtn').addEventListener('click', requestProbe);
  $('runBtn').addEventListener('click', runTests);
  $('loadChangeBtn').addEventListener('click', loadChangeStarter);
  $('restoreCodeBtn').addEventListener('click', restoreCode);
  $('resetCodeBtn').addEventListener('click', resetCode);
  $('diagnosisInput').addEventListener('input', (event) => {
    state.diagnosisText = event.target.value;
  });

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

  for (const id of ['briefingDialog', 'debriefDialog', 'historyDialog', 'examReportDialog']) {
    const dialog = $(id);
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      if (id === 'examReportDialog') exitExam();
      else dialog.close();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!exam.active || exam.submitted) return;
    if (document.hidden) {
      if (exam.running) {
        exam.running = false;
        exam.pausedByVisibility = true;
        exam.lastTick = performance.now();
        $('examTimerNote').textContent = 'Timer paused while this tab is hidden.';
        renderExamNav();
      }
    } else if (exam.pausedByVisibility && !exam.manualPause) {
      exam.running = true;
      exam.pausedByVisibility = false;
      exam.lastTick = performance.now();
      $('examTimerNote').textContent = 'Timer resumed.';
      renderExamNav();
    }
  });
}

async function init() {
  bindEvents();
  voice.autoSpeak = readStoredAutoSpeak();
  updateVoiceUI();
  updateMicUI();
  if (!speechSupported() && !voice.recognitionConstructor) {
    setVoiceNote('Voice features are not supported in this browser; the simulator stays text-only.');
  } else if (!speechSupported()) {
    setVoiceNote('Speech synthesis is not supported in this browser; interviewer messages are text-only.');
  } else if (!voice.recognitionConstructor) {
    setVoiceNote('Speech recognition is not supported in this browser; type your questions instead.');
  }
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
