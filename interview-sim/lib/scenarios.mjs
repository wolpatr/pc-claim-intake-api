import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const scenarioDir = path.join(here, '..', 'scenarios');

let cache = null;

export function loadScenarios({ refresh = false } = {}) {
  if (cache && !refresh) return cache;
  const files = readdirSync(scenarioDir).filter((name) => name.endsWith('.json')).sort();
  const scenarios = [];
  for (const file of files) {
    const full = path.join(scenarioDir, file);
    const parsed = JSON.parse(readFileSync(full, 'utf8'));
    parsed.__file = file;
    scenarios.push(parsed);
  }
  cache = scenarios;
  return scenarios;
}

export function getScenario(id) {
  return loadScenarios().find((scenario) => scenario.id === id) || null;
}

export function scenarioSummary(scenario) {
  return {
    id: scenario.id,
    title: scenario.title,
    difficulty: scenario.difficulty,
    topics: scenario.topics,
    phaseTimes: scenario.phaseTimes,
    tagline: scenario.tagline,
  };
}

export function publicScenario(scenario) {
  if (!scenario) return null;
  const change = scenario.changeRequest
    ? {
        statement: scenario.changeRequest.statement,
        starterCode: scenario.changeRequest.starterCode,
        fileName: scenario.changeRequest.fileName,
        prompt: scenario.changeRequest.prompt,
      }
    : null;
  return {
    id: scenario.id,
    title: scenario.title,
    difficulty: scenario.difficulty,
    topics: scenario.topics,
    tagline: scenario.tagline,
    phaseTimes: scenario.phaseTimes,
    intro: scenario.intro,
    clarifyingQuestions: scenario.clarifyingQuestions.map((item) => ({
      id: item.id,
      topic: item.topic,
      keywords: item.keywords,
      coach: item.coach,
    })),
    clarifyingFallback: scenario.clarifyingFallback,
    problemStatement: scenario.problemStatement,
    starterCode: scenario.starterCode,
    fileName: scenario.fileName,
    examples: scenario.examples,
    probes: scenario.probes,
    phasePrompts: scenario.phasePrompts,
    hints: scenario.hints,
    fallbackProbe: scenario.fallbackProbe,
    changeRequest: change,
    rubric: scenario.rubric.map((criterion) => ({
      id: criterion.id,
      criterion: criterion.criterion,
      weight: criterion.weight,
      strongAnswer: criterion.strongAnswer,
      type: criterion.type,
    })),
    referenceSolution: scenario.referenceSolution,
  };
}
