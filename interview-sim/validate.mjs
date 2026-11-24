import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { loadScenarios, roundTypeOf } from './lib/scenarios.mjs';
import { matchClarifying } from './lib/ai.mjs';
import {
  compileOnly,
  detectJdk,
  hasJavaTypeDeclaration,
  javaFileNameFor,
  runSubmission,
} from './lib/java.mjs';
import { criterionThreshold, gradeForPercentage, keywordCoverage } from './public/scoring.mjs';
import { LESSONS, METHOD_GROUPS } from './public/refreshers.mjs';
import { clearDrafts, readDraft, writeDraft } from './public/draft-store.mjs';
import {
  DEFAULT_EXAM_COUNT,
  loadQuizBank,
  publicExamQuestion,
  scoreExam,
  selectExamQuestions,
} from './lib/exam.mjs';

const failures = [];
const checks = [];
const ROUND_TYPES = ['coding', 'debugging', 'design'];
const RUBRIC_TYPES = ['tests', 'change', 'clarify', 'hints', 'efficiency', 'diagnosis', 'notes'];
const PHASES = ['brief', 'implement', 'test', 'change', 'debrief'];

const CLARIFY_PARAPHRASES = [
  { scenarioId: 'claim-validation', itemId: 'order', question: 'Does the order of errors matter?' },
  { scenarioId: 'claim-status-transition', itemId: 'same', question: 'What about the same status?' },
  { scenarioId: 'claim-validation', itemId: 'clock', question: 'How do I test the date logic?' },
  { scenarioId: 'claim-status-transition', itemId: 'errors', question: 'What if the transition is invalid?' },
  { scenarioId: 'claim-query-filter', itemId: 'expected', question: 'How are claim statuses handled?' },
  { scenarioId: 'claim-status-transition', itemId: 'rules', question: 'How are claim statuses handled?' },
];

function record(ok, label, detail = '') {
  checks.push({ ok, label });
  if (!ok) failures.push({ label, detail });
}

function isString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isString(item));
}

function validateCommon(scenario, problems) {
  if (!isString(scenario.title)) problems.push('title is required');
  if (!isString(scenario.tagline)) problems.push('tagline is required');
  if (!isString(scenario.difficulty)) problems.push('difficulty is required');
  if (!Array.isArray(scenario.topics) || scenario.topics.length === 0) problems.push('topics must be a non-empty array');
  if (!isString(scenario.intro)) problems.push('intro is required');
  if (!isString(scenario.problemStatement)) problems.push('problemStatement is required');
  if (!isString(scenario.clarifyingFallback)) problems.push('clarifyingFallback is required');
  if (!Array.isArray(scenario.clarifyingQuestions) || scenario.clarifyingQuestions.length === 0) {
    problems.push('clarifyingQuestions must be non-empty');
  } else {
    scenario.clarifyingQuestions.forEach((item, index) => {
      if (!isString(item.id)) problems.push(`clarifyingQuestions[${index}].id is required`);
      if (!isString(item.topic)) problems.push(`clarifyingQuestions[${index}].topic is required`);
      if (!isString(item.question)) problems.push(`clarifyingQuestions[${index}].question is required`);
      if (!isString(item.answer)) problems.push(`clarifyingQuestions[${index}].answer is required`);
      if (!isString(item.coach)) problems.push(`clarifyingQuestions[${index}].coach is required`);
      if (!Array.isArray(item.keywords) || item.keywords.length === 0) {
        problems.push(`clarifyingQuestions[${index}].keywords must be non-empty`);
      }
    });
  }
  if (!Array.isArray(scenario.hints) || scenario.hints.length < 3) problems.push('hints must have at least three entries');
  if (!Array.isArray(scenario.probes) || scenario.probes.length === 0) problems.push('probes must be non-empty');
  if (!scenario.phaseTimes || typeof scenario.phaseTimes !== 'object') {
    problems.push('phaseTimes is required');
  } else {
    for (const key of PHASES) {
      const value = scenario.phaseTimes[key];
      if (!Number.isFinite(value) || value <= 0) problems.push(`phaseTimes.${key} must be a positive number`);
    }
  }
  if (!scenario.phasePrompts || typeof scenario.phasePrompts !== 'object') {
    problems.push('phasePrompts is required');
  } else {
    for (const key of PHASES) {
      if (!isString(scenario.phasePrompts[key])) problems.push(`phasePrompts.${key} is required`);
    }
  }
  if (!Array.isArray(scenario.rubric) || scenario.rubric.length === 0) {
    problems.push('rubric must be non-empty');
  } else {
    const weight = scenario.rubric.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
    if (Math.abs(weight - 100) > 0.01) problems.push(`rubric weights must sum to 100, got ${weight}`);
    scenario.rubric.forEach((item, index) => {
      if (!isString(item.id)) problems.push(`rubric[${index}].id is required`);
      if (!isString(item.criterion)) problems.push(`rubric[${index}].criterion is required`);
      if (!isString(item.strongAnswer)) problems.push(`rubric[${index}].strongAnswer is required`);
      if (!RUBRIC_TYPES.includes(item.type)) problems.push(`rubric[${index}].type is invalid`);
      if (item.type === 'notes' && !isStringArray(item.keywords)) {
        problems.push(`rubric[${index}].keywords must be non-empty for a notes criterion`);
      }
    });
  }
}

function validateCodeScenario(scenario, problems) {
  if (!isString(scenario.starterCode)) problems.push('starterCode is required');
  if (!isString(scenario.fileName) || !scenario.fileName.endsWith('.java')) problems.push('fileName must end in .java');
  if (!isString(scenario.testSupport)) problems.push('testSupport is required');
  if (!isString(scenario.referenceSolution)) problems.push('referenceSolution is required');
  if (!Array.isArray(scenario.examples) || scenario.examples.length === 0) problems.push('examples must be non-empty');
  if (!Array.isArray(scenario.hiddenTests) || scenario.hiddenTests.length === 0) {
    problems.push('hiddenTests must be non-empty');
  } else {
    scenario.hiddenTests.forEach((test, index) => {
      if (!isString(test.name)) problems.push(`hiddenTests[${index}].name is required`);
      if (!isString(test.className)) problems.push(`hiddenTests[${index}].className is required`);
      if (!isString(test.code)) problems.push(`hiddenTests[${index}].code is required`);
    });
  }
  const change = scenario.changeRequest;
  if (!change || typeof change !== 'object') {
    problems.push('changeRequest is required');
  } else {
    for (const key of ['statement', 'starterCode', 'fileName']) {
      if (!isString(change[key])) problems.push(`changeRequest.${key} is required`);
    }
    if (isString(change.fileName) && !change.fileName.endsWith('.java')) {
      problems.push('changeRequest.fileName must end in .java');
    }
    if (!Array.isArray(change.hiddenTests) || change.hiddenTests.length === 0) {
      problems.push('changeRequest.hiddenTests must be non-empty');
    }
  }
  if (roundTypeOf(scenario) === 'debugging') {
    if (!isString(scenario.reproductionNote)) problems.push('reproductionNote is required for a debugging round');
    if (!scenario.diagnosis || typeof scenario.diagnosis !== 'object') {
      problems.push('diagnosis is required for a debugging round');
    } else {
      if (!isString(scenario.diagnosis.prompt)) problems.push('diagnosis.prompt is required');
      if (!isStringArray(scenario.diagnosis.keywords)) problems.push('diagnosis.keywords must be non-empty');
      if (!isString(scenario.diagnosis.strongAnswer)) problems.push('diagnosis.strongAnswer is required');
      if (isStringArray(scenario.diagnosis.keywords) && isString(scenario.diagnosis.strongAnswer)) {
        const threshold = criterionThreshold('diagnosis');
        const strong = keywordCoverage(scenario.diagnosis.strongAnswer, scenario.diagnosis.keywords);
        if (strong.value < threshold) {
          problems.push(
            `diagnosis strongAnswer matches ${strong.matched}/${strong.total} keywords, needs ${threshold}`,
          );
        }
      }
    }
    const regression = (scenario.hiddenTests || []).filter((test) => test.regression === true);
    if (!regression.length) problems.push('a debugging round needs at least one hidden test marked regression: true');
  }
}

function validateDesignScenario(scenario, problems) {
  if (!isString(scenario.starterCode)) problems.push('starterCode (design notes seed) is required');
  if (!isString(scenario.fileName) || !scenario.fileName.endsWith('.java')) problems.push('fileName must end in .java');
  if (!isString(scenario.referenceDesign)) problems.push('referenceDesign is required for a design round');
  if (!Array.isArray(scenario.examples) || scenario.examples.length === 0) problems.push('examples must be non-empty');
  if (!scenario.design || typeof scenario.design !== 'object') {
    problems.push('design is required for a design round');
  } else {
    if (!isString(scenario.design.prompt)) problems.push('design.prompt is required');
    if (!isStringArray(scenario.design.constraints)) problems.push('design.constraints must be a non-empty array of strings');
    if (!Array.isArray(scenario.design.probingQuestions) || scenario.design.probingQuestions.length === 0) {
      problems.push('design.probingQuestions must be non-empty');
    } else {
      scenario.design.probingQuestions.forEach((probe, index) => {
        if (!isString(probe.text)) problems.push(`design.probingQuestions[${index}].text is required`);
        if (!Number.isFinite(probe.atMinute) || probe.atMinute < 0) {
          problems.push(`design.probingQuestions[${index}].atMinute must be a non-negative number`);
        }
      });
    }
  }
  const change = scenario.changeRequest;
  if (!change || typeof change !== 'object') {
    problems.push('changeRequest (constraint change) is required');
  } else {
    for (const key of ['statement', 'prompt']) {
      if (!isString(change[key])) problems.push(`changeRequest.${key} is required`);
    }
  }
  const notes = (scenario.rubric || []).filter((item) => item.type === 'notes');
  if (!notes.length) problems.push('a design round needs at least one notes rubric criterion');
  for (const item of scenario.rubric || []) {
    if (!Array.isArray(item.keywords) || item.keywords.length === 0) continue;
    const threshold = criterionThreshold(item.type);
    const strong = keywordCoverage(item.strongAnswer, item.keywords);
    if (strong.value < threshold) {
      problems.push(
        `rubric ${item.id} strongAnswer matches ${strong.matched}/${strong.total} keywords, needs ${threshold}`,
      );
    }
    const reference = keywordCoverage(scenario.referenceDesign, item.keywords);
    if (reference.value < threshold) {
      problems.push(
        `rubric ${item.id} referenceDesign matches ${reference.matched}/${reference.total} keywords, needs ${threshold}`,
      );
    }
  }
}

function validateSchema(scenario) {
  const label = `schema:${scenario.id || scenario.__file}`;
  const problems = [];
  const roundType = roundTypeOf(scenario);
  if (!isString(scenario.id) || !/^[a-z0-9-]+$/.test(scenario.id)) problems.push('id must be kebab-case');
  if (!ROUND_TYPES.includes(scenario.roundType)) {
    problems.push(`roundType must be one of ${ROUND_TYPES.join(', ')}`);
  }
  validateCommon(scenario, problems);
  if (roundType === 'design') {
    validateDesignScenario(scenario, problems);
  } else {
    validateCodeScenario(scenario, problems);
  }
  record(problems.length === 0, label, problems.join('\n'));
}

function summarizeOutput(result) {
  const lines = [];
  if (result.compileOutput) lines.push(`compile:\n${result.compileOutput}`);
  for (const test of result.results || []) {
    lines.push(`${test.passed ? 'PASS' : 'FAIL'} ${test.name}${test.timedOut ? ' (timed out)' : ''}`);
    if (!test.passed && test.output) lines.push(test.output);
  }
  return lines.join('\n').slice(0, 6000);
}

async function checkCompiles(label, { source, fileName, testSupport, tests }) {
  const result = await compileOnly({ source, fileName, testSupport, tests });
  record(result.ok, label, result.output);
}

async function checkRuns(label, { source, fileName, testSupport, tests }, expect = 'all') {
  const result = await runSubmission({ source, fileName, testSupport, tests });
  const passed = (result.results || []).filter((test) => test.passed).length;
  const total = (tests || []).length;
  const ok = result.compiled && (expect === 'all' ? passed === total : passed >= expect);
  record(ok, label, summarizeOutput(result));
}

async function checkNotComplete(label, { source, fileName, testSupport, tests }) {
  const result = await runSubmission({ source, fileName, testSupport, tests });
  const passed = (result.results || []).filter((test) => test.passed).length;
  const total = (tests || []).length;
  const ok = !result.compiled || passed < total;
  record(ok, label, summarizeOutput(result));
}

async function checkRegressionFails(label, { source, fileName, testSupport, tests }, regressionNames) {
  const result = await runSubmission({ source, fileName, testSupport, tests });
  const failed = (result.results || []).filter((test) => regressionNames.includes(test.name) && !test.passed);
  record(result.compiled && failed.length > 0, label, summarizeOutput(result));
}

async function validateCodeChecks(scenario) {
  const roundType = roundTypeOf(scenario);
  await checkCompiles(`starter compiles with base tests: ${scenario.id}`, {
    source: scenario.starterCode,
    fileName: scenario.fileName,
    testSupport: scenario.testSupport,
    tests: scenario.hiddenTests,
  });

  await checkCompiles(`change starter compiles with change tests: ${scenario.id}`, {
    source: scenario.changeRequest.starterCode,
    fileName: scenario.changeRequest.fileName,
    testSupport: scenario.testSupport,
    tests: scenario.changeRequest.hiddenTests,
  });

  await checkNotComplete(`base starter still has work to do: ${scenario.id}`, {
    source: scenario.starterCode,
    fileName: scenario.fileName,
    testSupport: scenario.testSupport,
    tests: scenario.hiddenTests,
  });

  await checkNotComplete(`change starter still has work to do: ${scenario.id}`, {
    source: scenario.changeRequest.starterCode,
    fileName: scenario.changeRequest.fileName,
    testSupport: scenario.testSupport,
    tests: scenario.changeRequest.hiddenTests,
  });

  await checkRuns(`reference passes base tests: ${scenario.id}`, {
    source: scenario.referenceSolution,
    fileName: scenario.fileName,
    testSupport: scenario.testSupport,
    tests: scenario.hiddenTests,
  });

  await checkRuns(`reference passes change tests: ${scenario.id}`, {
    source: scenario.referenceSolution,
    fileName: scenario.changeRequest.fileName,
    testSupport: scenario.testSupport,
    tests: scenario.changeRequest.hiddenTests,
  });

  if (roundType === 'debugging') {
    const regressionNames = scenario.hiddenTests.filter((test) => test.regression === true).map((test) => test.name);
    await checkRegressionFails(`debugging starter fails its regression test: ${scenario.id}`, {
      source: scenario.starterCode,
      fileName: scenario.fileName,
      testSupport: scenario.testSupport,
      tests: scenario.hiddenTests,
    }, regressionNames);
  }
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function validateExamChecks() {
  const bank = loadQuizBank({ refresh: true });
  record(
    bank.topics.length === 8,
    `exam bank loads through the server path: ${bank.topics.length} topics`,
    `expected 8 topics`,
  );
  record(
    bank.questions.length >= DEFAULT_EXAM_COUNT,
    `exam bank has enough questions: ${bank.questions.length}`,
    `expected at least ${DEFAULT_EXAM_COUNT}`,
  );
  record(
    bank.questions.every((question) =>
      typeof question.explanation === 'string' &&
      question.explanation.trim().length > 0 &&
      Number.isInteger(question.answer) &&
      question.answer >= 0 &&
      question.answer < question.options.length),
    'exam bank questions carry a valid answer index and explanation',
  );
  record(
    bank.topics.every((topic) => bank.questions.some((question) => question.topic === topic.id)),
    'exam bank has at least one question per topic',
  );

  let selectionOk = true;
  let selectionDetail = '';
  for (let round = 0; round < 25 && selectionOk; round += 1) {
    const selection = selectExamQuestions({ count: DEFAULT_EXAM_COUNT, rng: seededRandom(round + 1) });
    const ids = selection.map((question) => question.id);
    const counts = new Map(bank.topics.map((topic) => [topic.id, 0]));
    for (const question of selection) counts.set(question.topic, (counts.get(question.topic) || 0) + 1);
    const topicCounts = [...counts.values()];
    const publicQuestions = selection.map(publicExamQuestion);
    if (selection.length !== DEFAULT_EXAM_COUNT) {
      selectionOk = false;
      selectionDetail = `round ${round}: selected ${selection.length}`;
    } else if (new Set(ids).size !== DEFAULT_EXAM_COUNT) {
      selectionOk = false;
      selectionDetail = `round ${round}: duplicate question ids`;
    } else if (topicCounts.some((count) => count < 2 || count > 3)) {
      selectionOk = false;
      selectionDetail = `round ${round}: topic counts ${topicCounts.join(',')}`;
    } else if (publicQuestions.some((question) => 'answer' in question || 'explanation' in question)) {
      selectionOk = false;
      selectionDetail = `round ${round}: answers or explanations leaked`;
    }
  }
  record(selectionOk, 'exam selection is 20 unique, balanced, answer-free questions', selectionDetail);

  const focusedIds = bank.questions.slice(0, 6).map((question) => question.id).reverse();
  const focused = selectExamQuestions({ ids: focusedIds });
  record(
    Boolean(focused) &&
      focused.length === focusedIds.length &&
      focused.map((question) => question.id).sort().join('|') === focusedIds.slice().sort().join('|'),
    'focused exam selection returns exactly the requested question ids',
  );
  record(
    selectExamQuestions({ ids: ['missing-question-id'] }) === null,
    'focused exam selection rejects an unknown question id',
  );

  const bands = [
    [100, 'Strong hire signal'],
    [85, 'Strong hire signal'],
    [84, 'Solid, with gaps'],
    [70, 'Solid, with gaps'],
    [69, 'Developing'],
    [50, 'Developing'],
    [49, 'Needs another pass'],
    [0, 'Needs another pass'],
  ];
  record(
    bands.every(([percentage, label]) => gradeForPercentage(percentage) === label),
    'exam grade bands match the simulator bands',
    bands.map(([percentage, label]) => `${percentage}=${gradeForPercentage(percentage)} (want ${label})`).join(', '),
  );

  const selection = selectExamQuestions({ count: DEFAULT_EXAM_COUNT, rng: seededRandom(99) });
  const ids = selection.map((question) => question.id);

  const allCorrect = scoreExam(ids, selection.map((question) => ({ id: question.id, selected: question.answer })));
  record(
    allCorrect.correct === allCorrect.total &&
      allCorrect.total === DEFAULT_EXAM_COUNT &&
      allCorrect.percentage === 100 &&
      allCorrect.grade === 'Strong hire signal' &&
      allCorrect.missed.length === 0 &&
      allCorrect.plan.length === 0 &&
      allCorrect.topicBreakdown.every((topic) => topic.correct === topic.total && topic.percentage === 100),
    'exam scoring handles the all-correct case',
    JSON.stringify({ correct: allCorrect.correct, total: allCorrect.total, grade: allCorrect.grade }),
  );

  const allWrong = scoreExam(ids, selection.map((question) => ({
    id: question.id,
    selected: (question.answer + 1) % question.options.length,
  })));
  const missedByTopic = new Map();
  for (const miss of allWrong.missed) {
    const list = missedByTopic.get(miss.topic) || [];
    list.push(miss.id);
    missedByTopic.set(miss.topic, list);
  }
  const planQuestionsOk = allWrong.plan.every((item) =>
    (item.missed || []).map((missed) => missed.id).sort().join('|') ===
      (missedByTopic.get(item.id) || []).slice().sort().join('|'),
  );
  record(
    allWrong.correct === 0 &&
      allWrong.percentage === 0 &&
      allWrong.grade === 'Needs another pass' &&
      allWrong.missed.length === DEFAULT_EXAM_COUNT &&
      allWrong.plan.length === bank.topics.length &&
      planQuestionsOk,
    'exam scoring handles the all-wrong case and plans every missed topic',
    JSON.stringify({
      correct: allWrong.correct,
      grade: allWrong.grade,
      plan: allWrong.plan.map((item) => item.id),
      planQuestionsOk,
    }),
  );

  const tieFixture = {
    git: bank.questions.filter((question) => question.topic === 'git').slice(0, 2),
    project: bank.questions.filter((question) => question.topic === 'project').slice(0, 4),
  };
  const tieAnswers = [
    ...tieFixture.git.map((question) => ({
      id: question.id,
      selected: (question.answer + 1) % question.options.length,
    })),
    ...tieFixture.project.map((question, index) => ({
      id: question.id,
      selected: index < 2 ? (question.answer + 1) % question.options.length : question.answer,
    })),
  ];
  const tied = scoreExam(
    [...tieFixture.git, ...tieFixture.project].map((question) => question.id),
    tieAnswers,
  );
  record(
    tied.plan.map((item) => item.id).join('|') === 'git|project',
    'exam plan breaks equal missed counts by the lower accuracy',
    JSON.stringify(tied.plan.map((item) => `${item.id}: ${item.missedCount} missed, ${item.accuracy}% correct`)),
  );

  const priorityFixture = {
    project: bank.questions.filter((question) => question.topic === 'project').slice(0, 2),
    testing: bank.questions.filter((question) => question.topic === 'testing').slice(0, 4),
  };
  const priorityAnswers = [
    ...priorityFixture.project.map((question) => ({
      id: question.id,
      selected: (question.answer + 1) % question.options.length,
    })),
    ...priorityFixture.testing.map((question, index) => ({
      id: question.id,
      selected: index < 3 ? (question.answer + 1) % question.options.length : question.answer,
    })),
  ];
  const prioritized = scoreExam(
    [...priorityFixture.project, ...priorityFixture.testing].map((question) => question.id),
    priorityAnswers,
  );
  record(
    prioritized.plan.map((item) => item.id).join('|') === 'testing|project' &&
      prioritized.plan[0].missedCount === 3 &&
      prioritized.plan[1].missedCount === 2,
    'exam plan ranks the topic with the most missed questions first regardless of bank order',
    JSON.stringify(prioritized.plan.map((item) => `${item.id}: ${item.missedCount} missed, ${item.accuracy}% correct`)),
  );

  const partialAnswers = selection.map((question) => {
    const topicIndex = bank.topics.findIndex((topic) => topic.id === question.topic);
    const wrong = topicIndex % 3 === 0;
    return {
      id: question.id,
      selected: wrong ? (question.answer + 1) % question.options.length : question.answer,
    };
  });
  const partial = scoreExam(ids, partialAnswers);
  const partialBreakdownOk = partial.topicBreakdown.every((topic) => {
    const items = selection.filter((question) => question.topic === topic.id);
    const correct = items.filter((question) => question.answer === partialAnswers.find((answer) => answer.id === question.id).selected).length;
    return topic.total === items.length &&
      topic.correct === correct &&
      topic.missedIds.length === items.length - correct &&
      topic.percentage === (items.length ? Math.round((correct / items.length) * 100) : 0);
  });
  record(
    partialBreakdownOk &&
      partial.plan.every((item) => item.missedCount === item.total - item.correct) &&
      partial.plan.length > 0,
    'exam scoring aggregates per topic and plans only missed topics',
    JSON.stringify(partial.topicBreakdown.map((topic) => `${topic.id}:${topic.correct}/${topic.total}`)),
  );

  const missedIds = partial.missed.map((miss) => miss.id);
  const retake = selectExamQuestions({ ids: missedIds });
  record(
    Boolean(retake) &&
      retake.length === missedIds.length &&
      retake.map((question) => question.id).sort().join('|') === missedIds.slice().sort().join('|'),
    `focused retake contains exactly the ${missedIds.length} missed question ids`,
  );
}

function pngSize(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buffer.length < 24 || signature.some((byte, index) => buffer[index] !== byte)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };
    const timer = setTimeout(
      () => finish(reject, new Error(`server did not start within 15s${stderr ? `: ${stderr.trim()}` : ''}`)),
      15000,
    );
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.includes('Interview simulator:')) finish(resolve, stdout);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => finish(reject, error));
    child.on('exit', (code) => finish(reject, new Error(`server exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`)));
  });
}

const SERVER_ENV_DEFAULTS = {
  INTERVIEW_SIM_HOST: '',
  INTERVIEW_SIM_LAN: '',
  INTERVIEW_SIM_HTTPS: '',
  INTERVIEW_SIM_PUBLIC_HOST: '',
  INTERVIEW_SIM_PUBLIC_URL: '',
  INTERVIEW_SIM_TLS_CERT: '',
  INTERVIEW_SIM_TLS_KEY: '',
};

async function startPwaServer(overrides = {}) {
  const serverPath = fileURLToPath(new URL('./server.mjs', import.meta.url));
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = 45000 + Math.floor(Math.random() * 10000);
    const child = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        ...SERVER_ENV_DEFAULTS,
        INTERVIEW_SIM_PORT: String(port),
        ...overrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const output = await waitForServer(child);
      return { child, port, baseUrl: `http://127.0.0.1:${port}`, output };
    } catch (error) {
      lastError = error;
      child.kill();
    }
  }
  throw lastError;
}

async function startServerExpectingFailure(publicUrl) {
  const serverPath = fileURLToPath(new URL('./server.mjs', import.meta.url));
  const port = 45000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ...SERVER_ENV_DEFAULTS,
      INTERVIEW_SIM_PORT: String(port),
      INTERVIEW_SIM_PUBLIC_URL: publicUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timedOut: true, code: null }), 10000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ timedOut: false, code: null });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ timedOut: false, code });
    });
  });
  if (result.timedOut) child.kill();
  return { ...result, stderr };
}

function httpJson(baseUrl, { route = '/', method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, `${baseUrl}/`);
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers,
      timeout: 10000,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    request.on('timeout', () => request.destroy(new Error('request timed out')));
    request.on('error', reject);
    request.end(body);
  });
}

async function exerciseServiceWorker(baseUrl, publicDir) {
  const source = await readFile(path.join(publicDir, 'sw.js'), 'utf8');
  const scope = new URL('./', `${baseUrl}/`);
  const listeners = new Map();
  const cacheStores = new Map();
  const precached = [];
  let offline = false;

  const swFetch = async (input, init) => {
    if (offline) throw new TypeError('Network unavailable');
    return fetch(input, init);
  };

  const cacheFor = (name) => {
    if (!cacheStores.has(name)) {
      const entries = new Map();
      cacheStores.set(name, {
        async addAll(items) {
          for (const item of items) {
            const url = new URL(item, scope).href;
            const response = await swFetch(url);
            if (!response || !response.ok) {
              throw new Error(`precache request failed: ${item} (${response ? response.status : 'no response'})`);
            }
            entries.set(url, response);
            precached.push(item);
          }
        },
        async match(request) {
          const url = new URL(typeof request === 'string' ? request : request.url, scope).href;
          return entries.get(url);
        },
        async put(request, response) {
          const url = new URL(typeof request === 'string' ? request : request.url, scope).href;
          entries.set(url, response);
        },
      });
    }
    return cacheStores.get(name);
  };

  const context = createContext({
    URL,
    Response,
    Request,
    console,
    fetch: swFetch,
    caches: {
      open: async (name) => cacheFor(name),
      keys: async () => [...cacheStores.keys()],
      delete: async (name) => cacheStores.delete(name),
    },
    self: {
      location: { origin: scope.origin },
      addEventListener: (type, handler) => listeners.set(type, handler),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
  });
  runInContext(source, context, { filename: 'sw.js' });

  const dispatch = async (type, event) => {
    const handler = listeners.get(type);
    if (!handler) throw new Error(`service worker has no ${type} listener`);
    const waits = [];
    let responsePromise = null;
    let responded = false;
    await handler({
      ...event,
      waitUntil: (promise) => waits.push(promise),
      respondWith: (promise) => {
        responded = true;
        responsePromise = Promise.resolve(promise);
      },
    });
    await Promise.all(waits);
    return { responded, response: responsePromise ? await responsePromise : undefined };
  };

  let installError = null;
  try {
    await dispatch('install', {});
  } catch (error) {
    installError = error;
  }
  record(
    !installError,
    'service worker install fetches every app-shell file',
    installError ? messageOf(installError) : `${precached.length} files cached`,
  );

  const requiredShell = [
    'index.html',
    'styles.css',
    'app.js',
    'scoring.mjs',
    'refreshers.mjs',
    'editor-assist.js',
    'draft-store.mjs',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
  ];
  const cachedPaths = new Set(precached.map((entry) => new URL(entry, scope).pathname.replace(/^\/+/, '')));
  record(
    requiredShell.every((entry) => cachedPaths.has(entry)),
    'service worker precaches the app shell and icons',
    `cached: ${[...cachedPaths].join(', ') || '(none)'}`,
  );

  const api = await dispatch('fetch', {
    request: { method: 'GET', mode: 'cors', url: new URL('api/health', scope).href },
  });
  record(!api.responded, 'service worker leaves /api requests to the network');

  offline = true;
  let navigation;
  try {
    navigation = await dispatch('fetch', {
      request: { method: 'GET', mode: 'navigate', url: new URL('some/deep/link', scope).href },
    });
  } finally {
    offline = false;
  }
  record(
    navigation.responded && Boolean(navigation.response) && navigation.response.status === 200,
    'service worker serves the cached shell for an offline navigation',
    navigation.responded ? `status ${navigation.response ? navigation.response.status : 'none'}` : 'no response',
  );
}

async function validatePwaChecks() {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
  let server;
  try {
    server = await startPwaServer();
  } catch (error) {
    record(false, 'server starts for the PWA checks', messageOf(error));
    return;
  }
  const manifestUrl = new URL('manifest.webmanifest', `${server.baseUrl}/`);
  try {
    const manifestResponse = await fetch(manifestUrl);
    record(
      manifestResponse.status === 200,
      'server serves the web app manifest',
      `status ${manifestResponse.status}`,
    );
    const manifestType = String(manifestResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    record(
      manifestType === 'application/manifest+json',
      'server serves the manifest with the web app manifest MIME type',
      `got ${manifestType || '(none)'}`,
    );

    let manifest;
    try {
      manifest = JSON.parse(await manifestResponse.text());
    } catch (error) {
      record(false, 'web app manifest loads', messageOf(error));
      return;
    }

    record(isString(manifest.name) && isString(manifest.short_name), 'manifest has a name and short name');
    record(manifest.display === 'standalone', 'manifest uses standalone display', `got ${manifest.display}`);
    record(isString(manifest.start_url) && isString(manifest.scope), 'manifest declares a start_url and scope');
    record(/^#[0-9a-f]{6}$/i.test(manifest.theme_color || ''), 'manifest has a theme color');
    record(/^#[0-9a-f]{6}$/i.test(manifest.background_color || ''), 'manifest has a background color');

    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    const iconFor = (size, purpose) => icons.find((icon) =>
      icon.sizes === size &&
      icon.type === 'image/png' &&
      (!purpose || String(icon.purpose || 'any').split(/\s+/).includes(purpose)));
    const sizes = [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']];
    for (const [size, purpose] of sizes) {
      const icon = iconFor(size, purpose);
      record(Boolean(icon), `manifest has a ${size} ${purpose} icon`, `icons: ${icons.map((item) => `${item.sizes}:${item.purpose || 'any'}`).join(', ')}`);
      if (!icon || !isString(icon.src)) continue;
      const iconResponse = await fetch(new URL(icon.src, manifestUrl));
      if (!iconResponse.ok) {
        record(false, `manifest icon is served: ${icon.src}`, `status ${iconResponse.status}`);
        continue;
      }
      const actual = pngSize(Buffer.from(await iconResponse.arrayBuffer()));
      record(
        Boolean(actual) && `${actual.width}x${actual.height}` === size,
        `manifest icon is a ${size} PNG: ${icon.src}`,
        actual ? `got ${actual.width}x${actual.height}` : 'not a PNG',
      );
    }

    try {
      await exerciseServiceWorker(server.baseUrl, publicDir);
    } catch (error) {
      record(false, 'service worker runs', messageOf(error));
    }
  } finally {
    server.child.kill();
  }
}

async function validatePublicUrlChecks() {
  const publicOrigin = 'https://sim-test.tailnet.example.ts.net:8443';
  const publicHost = 'sim-test.tailnet.example.ts.net:8443';
  let server;
  try {
    server = await startPwaServer({ INTERVIEW_SIM_PUBLIC_URL: publicOrigin });
  } catch (error) {
    record(false, 'server starts with INTERVIEW_SIM_PUBLIC_URL set', messageOf(error));
    return;
  }
  try {
    record(
      server.output.includes(`Interview simulator: ${publicOrigin}`),
      'startup message prints the public origin',
      server.output.trim().split(/\r?\n/)[0],
    );
    const accepted = await httpJson(server.baseUrl, {
      route: '/api/health',
      headers: { host: publicHost, origin: publicOrigin },
    });
    record(accepted.status === 200, 'public Host and Origin are accepted', `status ${accepted.status}`);
    const unknownHost = await httpJson(server.baseUrl, {
      route: '/api/health',
      headers: { host: 'unexpected.example.ts.net:8443', origin: publicOrigin },
    });
    record(unknownHost.status === 403, 'public mode still rejects an unknown Host', `status ${unknownHost.status}`);
    const unknownOrigin = await httpJson(server.baseUrl, {
      route: '/api/health',
      headers: { host: publicHost, origin: 'https://unexpected.example.ts.net:8443' },
    });
    record(unknownOrigin.status === 403, 'public mode still rejects an unknown Origin', `status ${unknownOrigin.status}`);
  } finally {
    server.child.kill();
  }

  const defaultOrigin = 'https://sim-default.tailnet.example.ts.net';
  const defaultHost = 'sim-default.tailnet.example.ts.net';
  let defaultPortServer;
  try {
    defaultPortServer = await startPwaServer({ INTERVIEW_SIM_PUBLIC_URL: defaultOrigin });
  } catch (error) {
    record(false, 'server starts with INTERVIEW_SIM_PUBLIC_URL and the default HTTPS port', messageOf(error));
    return;
  }
  try {
    const bareHost = await httpJson(defaultPortServer.baseUrl, {
      route: '/api/health',
      headers: { host: defaultHost, origin: defaultOrigin },
    });
    record(bareHost.status === 200, 'default-port public origin accepts the bare host form', `status ${bareHost.status}`);
  } finally {
    defaultPortServer.child.kill();
  }

  const malformed = [
    ['http://sim-test.tailnet.example.ts.net:8443', 'not https'],
    ['https://user:pass@sim-test.tailnet.example.ts.net:8443', 'credentials'],
    ['https://sim-test.tailnet.example.ts.net:8443/sim', 'path'],
    ['https://sim-test.tailnet.example.ts.net:8443/?mode=phone', 'query'],
    ['https://sim-test.tailnet.example.ts.net:8443/#app', 'fragment'],
    ['not a url', 'not a URL'],
  ];
  for (const [value, reason] of malformed) {
    const result = await startServerExpectingFailure(value);
    const stderr = result.stderr.trim();
    record(
      !result.timedOut && result.code === 1 && stderr.includes('INTERVIEW_SIM_PUBLIC_URL') &&
        stderr.split(/\r?\n/).length === 1,
      `INTERVIEW_SIM_PUBLIC_URL refuses a malformed value (${reason})`,
      result.timedOut ? 'server kept running' : `code ${result.code}, stderr: ${stderr}`,
    );
  }
}

function validateRefresherChecks() {
  const requiredLessons = [
    'variables',
    'operators',
    'strings',
    'conditionals',
    'loops',
    'arrays',
    'methods',
    'classes',
    'inheritance',
    'collections',
    'exceptions',
    'enums',
    'generics',
  ];
  record(Array.isArray(LESSONS) && LESSONS.length >= requiredLessons.length,
    `refresher lessons: ${Array.isArray(LESSONS) ? LESSONS.length : 0} (need at least ${requiredLessons.length})`);

  const lessonIds = new Set();
  for (const lesson of Array.isArray(LESSONS) ? LESSONS : []) {
    record(isString(lesson.id) && !lessonIds.has(lesson.id), `refresher lesson has a unique id: ${lesson.id || '(missing)'}`);
    lessonIds.add(lesson.id);
    record(
      isString(lesson.title) && isString(lesson.summary) && isString(lesson.example?.code) && isString(lesson.example?.output),
      `refresher lesson has a title, summary, code example, and output: ${lesson.id || '(missing)'}`,
    );
    record(
      Array.isArray(lesson.keyPoints) && lesson.keyPoints.length >= 2 && lesson.keyPoints.length <= 4 &&
        lesson.keyPoints.every((point) => isString(point)),
      `refresher lesson has two to four key points: ${lesson.id || '(missing)'}`,
    );
    record(
      Array.isArray(lesson.methodLinks) &&
        lesson.methodLinks.every((groupId) => METHOD_GROUPS.some((group) => group.id === groupId)),
      `refresher lesson links to existing method groups: ${lesson.id || '(missing)'}`,
    );
  }
  for (const id of requiredLessons) {
    record(lessonIds.has(id), `refresher lesson exists: ${id}`);
  }
  const actualOrder = (Array.isArray(LESSONS) ? LESSONS : []).slice(0, requiredLessons.length).map((lesson) => lesson.id);
  record(
    actualOrder.length === requiredLessons.length && actualOrder.every((id, index) => id === requiredLessons[index]),
    'refresher lessons keep the required order',
    `got ${actualOrder.join(', ') || '(none)'}`,
  );

  const requiredGroups = {
    string: ['isEmpty', 'length', 'charAt', 'substring', 'equals', 'equalsIgnoreCase', 'contains', 'startsWith', 'endsWith', 'indexOf', 'replace', 'split', 'trim', 'toUpperCase', 'toLowerCase', 'valueOf', 'format'],
    list: ['size', 'get', 'add', 'set', 'remove', 'contains', 'isEmpty', 'indexOf', 'clear', 'forEach'],
    map: ['put', 'get', 'getOrDefault', 'containsKey', 'containsValue', 'remove', 'keySet', 'values', 'entrySet', 'size', 'isEmpty'],
    stringbuilder: ['append', 'insert', 'deleteCharAt', 'reverse', 'toString', 'length'],
    math: ['max', 'min', 'abs', 'round', 'sqrt', 'pow', 'random'],
    integer: ['parseInt', 'valueOf', 'MAX_VALUE', 'MIN_VALUE'],
    arrays: ['asList', 'sort', 'toString', 'equals', 'copyOf'],
    collections: ['sort', 'reverse', 'max', 'min', 'frequency'],
    optional: ['of', 'ofNullable', 'empty', 'isPresent', 'isEmpty', 'get', 'orElse', 'map', 'filter'],
  };
  for (const [groupId, requiredMethods] of Object.entries(requiredGroups)) {
    const group = METHOD_GROUPS.find((item) => item.id === groupId);
    record(Boolean(group), `refresher method group exists: ${groupId}`);
    if (!group) continue;
    record(isString(group.title) && isString(group.subtitle),
      `refresher method group has a title and subtitle: ${groupId}`);
    const names = new Set((group.methods || []).map((method) => method.name));
    for (const name of requiredMethods) {
      record(names.has(name), `refresher method card exists: ${groupId}.${name}`);
    }
  }
  record(
    METHOD_GROUPS.some((group) => group.id === 'objects' &&
      ['equals', 'requireNonNull'].every((name) => group.methods.some((method) => method.name === name))),
    'refresher objects group covers equals and requireNonNull',
  );

  const methodIds = new Set();
  for (const group of METHOD_GROUPS) {
    for (const method of group.methods || []) {
      record(isString(method.id) && !methodIds.has(method.id), `refresher method has a unique id: ${method.id || '(missing)'}`);
      methodIds.add(method.id);
      record(
        isString(method.signature) && isString(method.returns) && isString(method.description) && isString(method.example),
        `refresher method card has a signature, return type, description, and example: ${method.id || '(missing)'}`,
      );
      record(
        isString(method.description) && method.description.length <= 160,
        `refresher method description is one short line: ${method.id || '(missing)'}`,
      );
    }
  }
}

function validateDraftPersistenceChecks() {
  const createStorage = (entries = []) => {
    const memory = new Map(entries);
    return {
      get length() { return memory.size; },
      key: (index) => [...memory.keys()][index] ?? null,
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => { memory.set(String(key), String(value)); },
      removeItem: (key) => { memory.delete(key); },
      entries: () => [...memory.entries()],
    };
  };
  const storage = createStorage();
  const offlineCode = 'class Intake {\n  int reviewed = 0;\n}';
  const changeCode = 'class Intake {\n  int reviewed = 0;\n  int pending = 0;\n}';
  record(
    writeDraft(storage, 'reload-demo', 'implement', 'editor', offlineCode),
    'draft store saves the editor draft for a phase',
  );
  writeDraft(storage, 'reload-demo', 'change', 'editor', changeCode);
  const reopened = createStorage(storage.entries());
  record(
    readDraft(reopened, 'reload-demo', 'implement', 'editor')?.text === offlineCode,
    'offline-authored code survives reopening the same phase',
  );
  record(
    readDraft(reopened, 'reload-demo', 'change', 'editor')?.text === changeCode,
    'each phase keeps its own saved draft',
  );
  record(
    readDraft(reopened, 'reload-demo', 'brief', 'editor') === null,
    'no saved draft falls back to the starter',
  );
  const diagnosis = 'The null check is missing before the map lookup.';
  writeDraft(reopened, 'reload-demo', 'implement', 'diagnosis', diagnosis);
  record(
    readDraft(reopened, 'reload-demo', 'implement', 'diagnosis')?.text === diagnosis,
    'the debugging diagnosis note restores with the same mechanism',
  );
  record(
    readDraft(reopened, 'reload-demo', 'implement', 'editor')?.text === offlineCode,
    'the diagnosis draft does not replace the editor draft',
  );
  const editedImplement = 'class Intake {\n  int reviewed = 1;\n}';
  writeDraft(reopened, 'reload-demo', 'implement', 'editor', editedImplement);
  record(
    readDraft(reopened, 'reload-demo', 'implement', 'editor')?.text === editedImplement &&
      readDraft(reopened, 'reload-demo', 'change', 'editor')?.text === changeCode,
    'editing the implement draft leaves the change draft untouched',
  );
  record(
    clearDrafts(reopened, 'reload-demo') === true &&
      readDraft(reopened, 'reload-demo', 'implement', 'editor') === null &&
      readDraft(reopened, 'reload-demo', 'change', 'editor') === null &&
      readDraft(reopened, 'reload-demo', 'implement', 'diagnosis') === null,
    'resetting a scenario clears all of its stored drafts',
  );
  const other = createStorage();
  writeDraft(other, 'other-scenario', 'implement', 'editor', offlineCode);
  record(
    clearDrafts(other, 'reload-demo') === true &&
      readDraft(other, 'other-scenario', 'implement', 'editor')?.text === offlineCode,
    'clearing one scenario keeps drafts for the others',
  );
  other.setItem('interview-sim.draft.v1:reload-demo:test:editor', '{not json');
  record(readDraft(other, 'reload-demo', 'test', 'editor') === null, 'a corrupt draft is ignored');
  record(
    writeDraft(null, 'reload-demo', 'implement', 'editor', offlineCode) === false,
    'unavailable storage never throws when saving',
  );
  record(
    readDraft(null, 'reload-demo', 'implement', 'editor') === null &&
      clearDrafts(null, 'reload-demo') === false,
    'unavailable storage never throws when restoring',
  );
}

async function main() {
  await validatePwaChecks();
  validateRefresherChecks();
  validateDraftPersistenceChecks();
  await validatePublicUrlChecks();
  const jdk = detectJdk({ refresh: true });
  if (!jdk.available) {
    process.stderr.write(`${jdk.installSteps.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`JDK: ${jdk.version} (${jdk.source}) at ${jdk.home || jdk.javac}\n`);

  validateExamChecks();

  const publicSketch = 'public class ReviewEngine {\n  private int reviews;\n}\n';
  const sketchFallback = 'ClaimReviewDesign.java';
  record(
    javaFileNameFor(publicSketch, sketchFallback) === 'ReviewEngine.java',
    'design sketch file name follows its public type',
    `got ${javaFileNameFor(publicSketch, sketchFallback)}`,
  );
  await checkCompiles('design sketch with a differently named public type compiles', {
    source: publicSketch,
    fileName: javaFileNameFor(publicSketch, sketchFallback),
    testSupport: '',
    tests: [],
  });
  record(
    javaFileNameFor('class Helper {\n}\n', sketchFallback) === sketchFallback,
    'package-private sketch keeps the scenario file name',
    `got ${javaFileNameFor('class Helper {\n}\n', sketchFallback)}`,
  );
  record(
    !hasJavaTypeDeclaration('record every decision in an audit log') &&
      !hasJavaTypeDeclaration('interface between the dispatcher and channel'),
    'design notes are not mistaken for a class sketch',
  );
  record(
    hasJavaTypeDeclaration('@FunctionalInterface interface Rule { int apply(int value); }'),
    'annotated interface declaration is recognised as a class sketch',
  );

  const scenarios = loadScenarios({ refresh: true });
  record(scenarios.length >= 12, `scenario count: ${scenarios.length} (need at least 12)`);

  const roundCounts = { coding: 0, debugging: 0, design: 0 };
  for (const scenario of scenarios) roundCounts[roundTypeOf(scenario)] += 1;
  record(roundCounts.coding >= 8, `coding scenarios: ${roundCounts.coding} (need at least 8)`);
  record(roundCounts.debugging >= 2, `debugging scenarios: ${roundCounts.debugging} (need at least 2)`);
  record(roundCounts.design >= 2, `design scenarios: ${roundCounts.design} (need at least 2)`);

  const debuggingScenarios = scenarios.filter((scenario) => roundTypeOf(scenario) === 'debugging');
  const claimDebug = debuggingScenarios.filter((scenario) => (scenario.topics || []).includes('Claim domain'));
  const coreDebug = debuggingScenarios.filter((scenario) => !(scenario.topics || []).includes('Claim domain'));
  record(claimDebug.length >= 1, `claim-domain debugging scenarios: ${claimDebug.length} (need at least 1)`);
  record(coreDebug.length >= 1, `core Java debugging scenarios: ${coreDebug.length} (need at least 1)`);

  const ids = new Set();
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const versionOneIds = [
    'claim-status-transition',
    'claim-validation',
    'claim-query-filter',
    'java-claim-index',
    'java-claim-streams',
    'java-batch-exceptions',
  ];
  record(
    versionOneIds.every((id) => byId.has(id) && roundTypeOf(byId.get(id)) === 'coding'),
    'version 1 scenarios default to the coding round type',
  );
  for (const paraphrase of CLARIFY_PARAPHRASES) {
    const scenario = byId.get(paraphrase.scenarioId);
    if (!scenario) {
      record(false, `clarify paraphrase scenario exists: ${paraphrase.scenarioId}`, '');
      continue;
    }
    const matched = matchClarifying(scenario, paraphrase.question);
    record(
      matched?.id === paraphrase.itemId,
      `clarify paraphrase resolves: ${paraphrase.scenarioId} "${paraphrase.question}"`,
      `resolved to ${matched?.id ?? 'null'}, expected ${paraphrase.itemId}`,
    );
  }
  for (const scenario of scenarios) {
    if (!isString(scenario.id)) {
      record(false, `scenario file ${scenario.__file} has no id`, '');
      continue;
    }
    record(!ids.has(scenario.id), `unique id: ${scenario.id}`);
    ids.add(scenario.id);
    validateSchema(scenario);

    for (const item of scenario.clarifyingQuestions || []) {
      const matched = matchClarifying(scenario, item.question);
      record(
        matched?.id === item.id,
        `clarifying example resolves to its own topic: ${scenario.id}/${item.id}`,
        `resolved to ${matched?.id ?? 'null'}`,
      );
    }

    if (roundTypeOf(scenario) === 'design') {
      record(
        (scenario.probes || []).length >= (scenario.design?.probingQuestions || []).length,
        `design probing questions are available as probes: ${scenario.id}`,
      );
      continue;
    }

    await validateCodeChecks(scenario);
  }

  const failed = checks.filter((check) => !check.ok);
  for (const check of failed) {
    process.stdout.write(`\nFAIL ${check.label}\n`);
  }
  if (failed.length) {
    process.stdout.write(`\n${failed.length} of ${checks.length} checks failed.\n`);
    for (const failure of failures) {
      process.stdout.write(`\n--- ${failure.label} ---\n${failure.detail || '(no detail)'}\n`);
    }
    process.exit(1);
  }

  const codeScenarios = scenarios.filter((scenario) => roundTypeOf(scenario) !== 'design');
  const baseTests = codeScenarios.reduce((sum, scenario) => sum + scenario.hiddenTests.length, 0);
  const changeTests = codeScenarios.reduce((sum, scenario) => sum + scenario.changeRequest.hiddenTests.length, 0);
  process.stdout.write(
    `\nOK: ${scenarios.length} scenarios (${roundCounts.coding} coding, ${roundCounts.debugging} debugging, ${roundCounts.design} design), ${baseTests} base tests, ${changeTests} change tests, ${checks.length} checks passed.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Validation crashed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
