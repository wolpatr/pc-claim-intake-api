import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const scenarioDir = path.join(here, '..', 'scenarios');

let cache = null;

export const ROUND_TYPES = ['coding', 'debugging', 'design'];

export function roundTypeOf(scenario) {
  return ROUND_TYPES.includes(scenario?.roundType) ? scenario.roundType : 'coding';
}

function normalize(parsed) {
  const scenario = { ...parsed };
  if (!scenario.roundType) scenario.roundType = 'coding';
  if ((!Array.isArray(scenario.probes) || scenario.probes.length === 0)
      && Array.isArray(scenario.design?.probingQuestions)) {
    scenario.probes = scenario.design.probingQuestions;
  }
  return scenario;
}

export function loadScenarios({ refresh = false } = {}) {
  if (cache && !refresh) return cache;
  const files = readdirSync(scenarioDir).filter((name) => name.endsWith('.json')).sort();
  const scenarios = [];
  for (const file of files) {
    const full = path.join(scenarioDir, file);
    const parsed = normalize(JSON.parse(readFileSync(full, 'utf8')));
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
    roundType: roundTypeOf(scenario),
    topics: scenario.topics,
    phaseTimes: scenario.phaseTimes,
    tagline: scenario.tagline,
  };
}

export function publicScenario(scenario) {
  if (!scenario) return null;
  const roundType = roundTypeOf(scenario);
  const change = scenario.changeRequest
    ? {
        statement: scenario.changeRequest.statement,
        starterCode: scenario.changeRequest.starterCode ?? null,
        fileName: scenario.changeRequest.fileName ?? null,
        prompt: scenario.changeRequest.prompt,
      }
    : null;
  return {
    id: scenario.id,
    title: scenario.title,
    difficulty: scenario.difficulty,
    roundType,
    topics: scenario.topics,
    tagline: scenario.tagline,
    phaseTimes: scenario.phaseTimes,
    intro: scenario.intro,
    clarifyingQuestions: (scenario.clarifyingQuestions || []).map((item) => ({
      id: item.id,
      topic: item.topic,
      keywords: item.keywords,
      coach: item.coach,
    })),
    clarifyingFallback: scenario.clarifyingFallback,
    problemStatement: scenario.problemStatement,
    starterCode: scenario.starterCode,
    fileName: scenario.fileName,
    examples: scenario.examples || [],
    probes: scenario.probes || [],
    phasePrompts: scenario.phasePrompts,
    hints: scenario.hints,
    fallbackProbe: scenario.fallbackProbe,
    reproductionNote: scenario.reproductionNote || null,
    diagnosis: scenario.diagnosis
      ? {
          prompt: scenario.diagnosis.prompt,
          keywords: scenario.diagnosis.keywords,
          strongAnswer: scenario.diagnosis.strongAnswer,
        }
      : null,
    design: scenario.design
      ? {
          prompt: scenario.design.prompt,
          constraints: scenario.design.constraints,
          probingQuestions: scenario.design.probingQuestions,
        }
      : null,
    changeRequest: change,
    rubric: (scenario.rubric || []).map((criterion) => ({
      id: criterion.id,
      criterion: criterion.criterion,
      weight: criterion.weight,
      strongAnswer: criterion.strongAnswer,
      type: criterion.type,
      keywords: criterion.keywords || null,
    })),
    referenceSolution: scenario.referenceSolution || null,
    referenceDesign: scenario.referenceDesign || null,
  };
}
