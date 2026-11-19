#!/usr/bin/env node
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const data = require("./questions.js");

const errors = [];

function fail(message) {
  errors.push(message);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function checkQuestion(question, index, topicIds, seenIds) {
  const where = `question[${index}]${question && question.id ? ` (${question.id})` : ""}`;

  if (!question || typeof question !== "object") {
    fail(`${where}: must be an object`);
    return;
  }

  if (!isNonEmptyString(question.id)) {
    fail(`${where}: id must be a non-empty string`);
  } else if (seenIds.has(question.id)) {
    fail(`${where}: duplicate id "${question.id}"`);
  } else {
    seenIds.add(question.id);
  }

  if (!isNonEmptyString(question.topic)) {
    fail(`${where}: topic must be a non-empty string`);
  } else if (!topicIds.has(question.topic)) {
    fail(`${where}: unknown topic "${question.topic}"`);
  }

  if (!isNonEmptyString(question.prompt)) {
    fail(`${where}: prompt must be a non-empty string`);
  }

  if (!isNonEmptyString(question.explanation)) {
    fail(`${where}: explanation must be a non-empty string`);
  }

  if (question.type === "multiple-choice") {
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      fail(`${where}: multiple-choice questions need exactly four options`);
    } else if (!question.options.every(isNonEmptyString)) {
      fail(`${where}: every option must be a non-empty string`);
    }
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) {
      fail(`${where}: answer must be an integer index from 0 to 3`);
    }
  } else if (question.type === "true-false") {
    const options = Array.isArray(question.options) ? question.options : [];
    const validOptions =
      options.length === 2 && options[0] === "True" && options[1] === "False";
    if (!validOptions) {
      fail(`${where}: true-false questions need options exactly ["True", "False"]`);
    }
    if (question.answer !== 0 && question.answer !== 1) {
      fail(`${where}: answer must be 0 (True) or 1 (False)`);
    }
  } else {
    fail(`${where}: type must be "multiple-choice" or "true-false"`);
  }
}

if (!data || typeof data !== "object") {
  fail("questions.js must export an object with topics and questions");
} else {
  const { topics, questions } = data;

  if (!Array.isArray(topics) || topics.length === 0) {
    fail("topics must be a non-empty array");
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    fail("questions must be a non-empty array");
  }

  if (!errors.length) {
    const topicIds = new Set();
    for (const topic of topics) {
      if (!topic || !isNonEmptyString(topic.id)) {
        fail("every topic needs a non-empty id");
        continue;
      }
      if (topicIds.has(topic.id)) {
        fail(`duplicate topic id "${topic.id}"`);
      }
      topicIds.add(topic.id);
      if (!isNonEmptyString(topic.name)) {
        fail(`topic "${topic.id}": name must be a non-empty string`);
      }
    }

    const seenIds = new Set();
    questions.forEach((question, index) => {
      checkQuestion(question, index, topicIds, seenIds);
    });

    const counts = new Map();
    const typesByTopic = new Map();
    for (const question of questions) {
      if (!question || !isNonEmptyString(question.topic)) continue;
      counts.set(question.topic, (counts.get(question.topic) || 0) + 1);
      if (!typesByTopic.has(question.topic)) typesByTopic.set(question.topic, new Set());
      typesByTopic.get(question.topic).add(question.type);
    }

    for (const topic of topics) {
      if (!topic || !isNonEmptyString(topic.id)) continue;
      const count = counts.get(topic.id) || 0;
      if (count < 10) {
        fail(`topic "${topic.id}": needs at least 10 questions, found ${count}`);
      }
      const types = typesByTopic.get(topic.id) || new Set();
      if (!types.has("multiple-choice")) {
        fail(`topic "${topic.id}": needs at least one multiple-choice question`);
      }
      if (!types.has("true-false")) {
        fail(`topic "${topic.id}": needs at least one true-false question`);
      }
    }

    if (!errors.length) {
      console.log(`OK: ${questions.length} questions across ${topics.length} topics.`);
      for (const topic of topics) {
        console.log(`  ${topic.id}: ${counts.get(topic.id)} questions`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Validation failed with ${errors.length} problem(s):`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exitCode = 1;
}
