import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeForPercentage } from '../public/scoring.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const quizPath = path.resolve(here, '..', '..', 'quiz', 'questions.js');
const require = createRequire(import.meta.url);

export const DEFAULT_EXAM_COUNT = 20;
export const DEFAULT_EXAM_MINUTES = 25;

let bankCache = null;

export function loadQuizBank({ refresh = false } = {}) {
  if (bankCache && !refresh) return bankCache;
  const data = require(quizPath);
  if (!data || !Array.isArray(data.topics) || !Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('The quiz question bank could not be loaded.');
  }
  for (const topic of data.topics) {
    if (!topic || typeof topic.id !== 'string' || typeof topic.name !== 'string') {
      throw new Error('The quiz question bank has an invalid topic.');
    }
  }
  const ids = new Set();
  for (const question of data.questions) {
    if (!question || typeof question.id !== 'string' || ids.has(question.id)) {
      throw new Error('The quiz question bank has missing or duplicate question ids.');
    }
    ids.add(question.id);
    if (!Array.isArray(question.options) || !question.options.length) {
      throw new Error(`Question ${question.id} has no options.`);
    }
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) {
      throw new Error(`Question ${question.id} has an invalid answer index.`);
    }
  }
  bankCache = data;
  return bankCache;
}

export function publicExamQuestion(question) {
  return {
    id: question.id,
    topic: question.topic,
    type: question.type,
    prompt: question.prompt,
    options: [...question.options],
  };
}

function shuffled(list, rng) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function questionsByIds(ids) {
  const bank = loadQuizBank();
  const byId = new Map(bank.questions.map((question) => [question.id, question]));
  const questions = [];
  const unknown = [];
  const seen = new Set();
  for (const id of ids || []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const question = byId.get(id);
    if (question) questions.push(question);
    else unknown.push(id);
  }
  return { questions, unknown };
}

export function selectExamQuestions({ count = DEFAULT_EXAM_COUNT, ids = null, rng = Math.random } = {}) {
  if (Array.isArray(ids)) {
    const { questions, unknown } = questionsByIds(ids);
    return unknown.length ? null : questions;
  }
  const bank = loadQuizBank();
  const limit = Math.max(1, Math.min(Number(count) || DEFAULT_EXAM_COUNT, bank.questions.length));
  const buckets = bank.topics.map((topic) =>
    shuffled(bank.questions.filter((question) => question.topic === topic.id), rng),
  );
  const selected = [];
  let round = 0;
  while (selected.length < limit) {
    let added = false;
    for (const bucket of buckets) {
      if (!bucket[round]) continue;
      selected.push(bucket[round]);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return selected.slice(0, limit);
}

function normalizeSelected(question, raw) {
  const selected = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (!Number.isInteger(selected) || selected < 0 || selected >= question.options.length) return null;
  return selected;
}

export function scoreExam(questionIds, answers = []) {
  const bank = loadQuizBank();
  const byId = new Map(bank.questions.map((question) => [question.id, question]));
  const answerMap = new Map();
  for (const answer of Array.isArray(answers) ? answers : []) {
    if (!answer || typeof answer.id !== 'string') continue;
    answerMap.set(answer.id, answer.selected);
  }

  const results = [];
  for (const id of questionIds || []) {
    const question = byId.get(id);
    if (!question) throw new Error(`Unknown question id: ${id}`);
    const selected = normalizeSelected(question, answerMap.get(id));
    results.push({
      question,
      selected,
      correct: selected === question.answer,
    });
  }

  const total = results.length;
  const correct = results.filter((result) => result.correct).length;
  const percentage = total ? Math.round((correct / total) * 100) : 0;

  const topicBreakdown = bank.topics
    .map((topic) => {
      const items = results.filter((result) => result.question.topic === topic.id);
      const topicCorrect = items.filter((result) => result.correct).length;
      return {
        id: topic.id,
        name: topic.name,
        total: items.length,
        correct: topicCorrect,
        percentage: items.length ? Math.round((topicCorrect / items.length) * 100) : 0,
        missedIds: items.filter((result) => !result.correct).map((result) => result.question.id),
      };
    })
    .filter((topic) => topic.total > 0);

  const missed = results
    .filter((result) => !result.correct)
    .map((result) => {
      const question = result.question;
      return {
        id: question.id,
        topic: question.topic,
        topicName: bank.topics.find((topic) => topic.id === question.topic)?.name || question.topic,
        type: question.type,
        prompt: question.prompt,
        options: [...question.options],
        selectedIndex: result.selected,
        selectedAnswer: result.selected === null ? null : question.options[result.selected],
        correctIndex: question.answer,
        correctAnswer: question.options[question.answer],
        explanation: question.explanation || '',
      };
    });

  const topicOrder = new Map(bank.topics.map((topic, index) => [topic.id, index]));
  const missedById = new Map(missed.map((item) => [item.id, item]));
  const plan = topicBreakdown
    .filter((topic) => topic.missedIds.length > 0)
    .map((topic) => ({
      id: topic.id,
      topic: topic.id,
      name: topic.name,
      total: topic.total,
      correct: topic.correct,
      accuracy: topic.percentage,
      missedCount: topic.missedIds.length,
      missed: topic.missedIds.map((id) => ({
        id,
        prompt: missedById.get(id)?.prompt || '',
      })),
    }))
    .sort((left, right) =>
      right.missedCount - left.missedCount ||
      left.accuracy - right.accuracy ||
      (topicOrder.get(left.id) ?? 0) - (topicOrder.get(right.id) ?? 0),
    );

  return {
    total,
    correct,
    percentage,
    grade: gradeForPercentage(percentage),
    topicBreakdown,
    missed,
    plan,
  };
}
