const TIMEOUT_MS = 20000;

function config() {
  const baseUrl = (process.env.INTERVIEW_SIM_AI_BASE_URL || '').trim();
  const key = (process.env.INTERVIEW_SIM_AI_KEY || '').trim();
  const model = (process.env.INTERVIEW_SIM_AI_MODEL || '').trim();
  return {
    configured: Boolean(baseUrl && key && model),
    baseUrl,
    key,
    model,
  };
}

export function aiStatus() {
  const { configured, model } = config();
  return {
    configured,
    mode: configured ? 'hybrid' : 'scripted',
    model: configured ? model : null,
  };
}

function endpoint(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

async function chat(messages, { maxTokens = 400, temperature = 0.4 } = {}) {
  const { configured, baseUrl, key, model } = config();
  if (!configured) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint(baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature,
        max_tokens: maxTokens,
        messages,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) return null;
    return text.trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function keywordScore(question, item) {
  const normalized = String(question || '').toLowerCase();
  let score = 0;
  for (const keyword of item.keywords || []) {
    const needle = String(keyword).toLowerCase();
    if (needle && normalized.includes(needle)) score += 2;
  }
  for (const word of String(item.topic || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 4 && normalized.includes(word)) score += 1;
  }
  return score;
}

export function matchClarifying(scenario, question) {
  let best = null;
  let bestScore = 0;
  for (const item of scenario.clarifyingQuestions || []) {
    const score = keywordScore(question, item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function scenarioFacts(scenario) {
  const lines = [
    `Scenario: ${scenario.title}`,
    `Interviewer opening: ${scenario.intro}`,
    'Problem statement:',
    scenario.problemStatement,
    'Visible examples:',
    ...(scenario.examples || []).map((example) => `- ${example.input} => ${example.output}`),
    'Interviewer-approved answers to clarifying questions:',
    ...(scenario.clarifyingQuestions || []).map((item) => `- ${item.topic}: ${item.answer}`),
  ];
  return lines.join('\n');
}

export async function clarifyingAnswer(scenario, question) {
  const scripted = matchClarifying(scenario, question);
  const fallback = scripted
    ? { answer: scripted.answer, source: 'scripted', matchedId: scripted.id, matchedTopic: scripted.topic }
    : {
        answer: scenario.clarifyingFallback,
        source: 'scripted',
        matchedId: null,
        matchedTopic: null,
      };

  if (!aiStatus().configured) return fallback;

  const text = await chat([
    {
      role: 'system',
      content:
        'You are a senior Java interviewer in a live coding interview. Answer the candidate clarifying question in 1 to 3 short sentences, grounded only in the scenario facts. If the facts leave something open, state a reasonable assumption and move on. Never write implementation code, never mention hidden tests, and never reveal a reference solution.',
    },
    {
      role: 'user',
      content: `${scenarioFacts(scenario)}\n\nCandidate question: ${question}`,
    },
  ], { maxTokens: 220, temperature: 0.3 });

  if (!text) return { ...fallback, aiError: true };
  return {
    answer: text,
    source: 'ai',
    matchedId: scripted?.id ?? null,
    matchedTopic: scripted?.topic ?? null,
  };
}

export async function adaptiveProbe(scenario, { code, phase, elapsedSeconds, usedProbes = [] }) {
  const used = new Set(usedProbes);
  const candidates = (scenario.probes || []).filter((probe) => probe.text && !used.has(probe.text));

  if (aiStatus().configured) {
    const text = await chat([
      {
        role: 'system',
        content:
          'You are a senior Java interviewer watching a candidate code. Ask exactly one short probing question about their current approach, edge cases, or trade-offs. Maximum 45 words. Do not give the answer and do not write code.',
      },
      {
        role: 'user',
        content: `${scenarioFacts(scenario)}\n\nPhase: ${phase}\nPhase elapsed seconds: ${elapsedSeconds}\nRecent candidate code:\n${String(code || '').slice(-8000)}`,
      },
    ], { maxTokens: 120, temperature: 0.5 });
    if (text) return { text, source: 'ai' };
  }

  const upcoming = candidates
    .slice()
    .sort((a, b) => (a.atMinute || 0) - (b.atMinute || 0))
    .find((probe) => (probe.atMinute || 0) * 60 >= Number(elapsedSeconds || 0));
  const chosen = upcoming || candidates[0];
  const text = chosen?.text
    || scenario.fallbackProbe
    || scenario.phasePrompts?.[phase]
    || 'Talk me through what you are doing and what could still go wrong.';
  return { text, source: 'scripted' };
}

function fallbackNarrative(summary) {
  const base = summary?.tests?.base || { passed: 0, total: 0 };
  const change = summary?.tests?.change || { passed: 0, total: 0 };
  const score = Math.round(summary?.score || 0);
  const hints = summary?.hintsUsed ?? 0;
  const missed = summary?.missed || [];
  const parts = [];
  parts.push(
    `You finished with a score of ${score}/100. The base suite passed ${base.passed} of ${base.total} tests and the change request passed ${change.passed} of ${change.total}.`,
  );
  if (missed.length) {
    parts.push(`The criteria still short of strong are: ${missed.join('; ')}. Name each one back before you retry, then decide the smallest change that would move it.`);
  } else {
    parts.push('Every rubric criterion reached the strong band. That is the level to reproduce under a real clock, not just once.');
  }
  parts.push(
    `You used ${hints} hint${hints === 1 ? '' : 's'}. In a real interview, ask the clarifying questions early and say your edge cases out loud before writing code.`,
  );
  return parts.join('\n\n');
}

export async function debriefNarrative(scenario, summary) {
  const fallback = { text: fallbackNarrative(summary), source: 'scripted' };
  if (!aiStatus().configured) return fallback;

  const text = await chat([
    {
      role: 'system',
      content:
        'You are a senior Java interviewer giving a concise post-interview debrief. Write three short paragraphs: what went well, the most important gaps, and one concrete next practice step. Be direct and specific to the evidence. Never write implementation code and never invent test results.',
    },
    {
      role: 'user',
      content: `${scenarioFacts(scenario)}\n\nSession evidence:\n${JSON.stringify(summary, null, 2)}`,
    },
  ], { maxTokens: 450, temperature: 0.5 });

  if (!text) return { ...fallback, aiError: true };
  return { text, source: 'ai' };
}
