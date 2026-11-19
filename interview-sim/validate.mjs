import path from 'node:path';
import { loadScenarios } from './lib/scenarios.mjs';
import { compileOnly, detectJdk, runSubmission } from './lib/java.mjs';

const failures = [];
const checks = [];

function record(ok, label, detail = '') {
  checks.push({ ok, label });
  if (!ok) failures.push({ label, detail });
}

function isString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkArray(ok, label) {
  record(ok, label);
}

function validateSchema(scenario) {
  const label = `schema:${scenario.id || scenario.__file}`;
  const problems = [];
  if (!isString(scenario.id) || !/^[a-z0-9-]+$/.test(scenario.id)) problems.push('id must be kebab-case');
  if (!isString(scenario.title)) problems.push('title is required');
  if (!isString(scenario.tagline)) problems.push('tagline is required');
  if (!isString(scenario.difficulty)) problems.push('difficulty is required');
  if (!Array.isArray(scenario.topics) || scenario.topics.length === 0) problems.push('topics must be a non-empty array');
  if (!isString(scenario.intro)) problems.push('intro is required');
  if (!isString(scenario.problemStatement)) problems.push('problemStatement is required');
  if (!isString(scenario.starterCode)) problems.push('starterCode is required');
  if (!isString(scenario.fileName) || !scenario.fileName.endsWith('.java')) problems.push('fileName must end in .java');
  if (!isString(scenario.testSupport)) problems.push('testSupport is required');
  if (!isString(scenario.referenceSolution)) problems.push('referenceSolution is required');
  if (!isString(scenario.clarifyingFallback)) problems.push('clarifyingFallback is required');
  if (!Array.isArray(scenario.examples) || scenario.examples.length === 0) problems.push('examples must be non-empty');
  if (!Array.isArray(scenario.clarifyingQuestions) || scenario.clarifyingQuestions.length === 0) {
    problems.push('clarifyingQuestions must be non-empty');
  } else {
    scenario.clarifyingQuestions.forEach((item, index) => {
      if (!isString(item.id)) problems.push(`clarifyingQuestions[${index}].id is required`);
      if (!isString(item.topic)) problems.push(`clarifyingQuestions[${index}].topic is required`);
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
    for (const key of ['brief', 'implement', 'test', 'change', 'debrief']) {
      const value = scenario.phaseTimes[key];
      if (!Number.isFinite(value) || value <= 0) problems.push(`phaseTimes.${key} must be a positive number`);
    }
  }
  if (!scenario.phasePrompts || typeof scenario.phasePrompts !== 'object') {
    problems.push('phasePrompts is required');
  } else {
    for (const key of ['brief', 'implement', 'test', 'change', 'debrief']) {
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
      if (!['tests', 'change', 'clarify', 'hints', 'efficiency'].includes(item.type)) {
        problems.push(`rubric[${index}].type is invalid`);
      }
    });
  }
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

async function main() {
  const jdk = detectJdk({ refresh: true });
  if (!jdk.available) {
    process.stderr.write(`${jdk.installSteps.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`JDK: ${jdk.version} (${jdk.source}) at ${jdk.home || jdk.javac}\n`);

  const scenarios = loadScenarios({ refresh: true });
  record(scenarios.length >= 6, `scenario count: ${scenarios.length} (need at least 6)`);

  const ids = new Set();
  for (const scenario of scenarios) {
    if (!isString(scenario.id)) {
      record(false, `scenario file ${scenario.__file} has no id`, '');
      continue;
    }
    record(!ids.has(scenario.id), `unique id: ${scenario.id}`);
    ids.add(scenario.id);
    validateSchema(scenario);

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

  const baseTests = scenarios.reduce((sum, scenario) => sum + scenario.hiddenTests.length, 0);
  const changeTests = scenarios.reduce((sum, scenario) => sum + scenario.changeRequest.hiddenTests.length, 0);
  process.stdout.write(`\nOK: ${scenarios.length} scenarios, ${baseTests} base tests, ${changeTests} change tests, ${checks.length} checks passed.\n`);
}

main().catch((error) => {
  process.stderr.write(`Validation crashed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
