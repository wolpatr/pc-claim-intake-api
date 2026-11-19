import { loadScenarios, roundTypeOf } from './lib/scenarios.mjs';
import { matchClarifying } from './lib/ai.mjs';
import {
  compileOnly,
  detectJdk,
  hasJavaTypeDeclaration,
  javaFileNameFor,
  runSubmission,
} from './lib/java.mjs';
import { criterionThreshold, keywordCoverage } from './public/scoring.mjs';

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

async function main() {
  const jdk = detectJdk({ refresh: true });
  if (!jdk.available) {
    process.stderr.write(`${jdk.installSteps.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`JDK: ${jdk.version} (${jdk.source}) at ${jdk.home || jdk.javac}\n`);

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
