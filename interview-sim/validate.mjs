import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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

async function validatePwaChecks() {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(publicDir, 'manifest.webmanifest'), 'utf8'));
  } catch (error) {
    record(false, 'web app manifest loads', error instanceof Error ? error.message : String(error));
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
    try {
      const buffer = await readFile(path.join(publicDir, icon.src));
      const actual = pngSize(buffer);
      record(
        Boolean(actual) && `${actual.width}x${actual.height}` === size,
        `manifest icon is a ${size} PNG: ${icon.src}`,
        actual ? `got ${actual.width}x${actual.height}` : 'not a PNG',
      );
    } catch {
      record(false, `manifest icon exists: ${icon.src}`, 'file not found');
    }
  }

  const indexHtml = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  record(/<link[^>]+rel="manifest"[^>]+href="manifest\.webmanifest"/.test(indexHtml), 'index links the web app manifest');
  record(/<meta[^>]+name="theme-color"/.test(indexHtml), 'index declares a theme color');
  record(/viewport-fit=cover/.test(indexHtml), 'viewport opts into safe-area insets');

  const appJs = await readFile(path.join(publicDir, 'app.js'), 'utf8');
  record(
    /'serviceWorker' in navigator/.test(appJs) && /window\.isSecureContext/.test(appJs) && /register\(['"]\.\/sw\.js['"]\)/.test(appJs),
    'service worker registers only in a secure context',
  );

  const sw = await readFile(path.join(publicDir, 'sw.js'), 'utf8');
  const shellMatch = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  const shellEntries = shellMatch ? [...shellMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]) : [];
  const shellRequired = ['./index.html', './styles.css', './app.js', './scoring.mjs', './manifest.webmanifest'];
  record(
    shellRequired.every((entry) => shellEntries.includes(entry)),
    'service worker precaches the app shell',
    `cached: ${shellEntries.join(', ')}`,
  );
  record(
    ['./icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'].every((entry) => shellEntries.includes(entry)),
    'service worker precaches the manifest icons',
  );
  record(/url\.pathname\.startsWith\(['"]\/api\/['"]\)/.test(sw), 'service worker leaves /api requests to the network');
  record(/request\.mode === ['"]navigate['"]/.test(sw), 'service worker serves an offline navigation fallback');

  const server = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs'), 'utf8');
  record(/['"]\.webmanifest['"]\s*:\s*['"]application\/manifest\+json['"]/.test(server), 'server serves the manifest with the web app manifest MIME type');
  record(
    /DEFAULT_HOST = ['"]127\.0\.0\.1['"]/.test(server) &&
      /INTERVIEW_SIM_LAN/.test(server) &&
      /INTERVIEW_SIM_HTTPS/.test(server) &&
      /INTERVIEW_SIM_PUBLIC_HOST/.test(server),
    'server keeps the loopback default and offers opt-in LAN and HTTPS modes',
  );
}

async function main() {
  await validatePwaChecks();
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
