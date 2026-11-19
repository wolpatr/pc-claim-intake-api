# Claim Intake Study Quiz

A small offline quiz app for self-testing the material in this repository and the
two-week study plan: project & P&C, software fundamentals, Java, object-oriented
design, Agile, Git, REST, and testing & CI.

It is plain HTML, CSS, and JavaScript. There is no build step, no server, and no
network access.

## Run it

Open `quiz/index.html` in a modern browser. That is the whole install.

You can double-click the file, or use the browser's File > Open menu. Scores are
saved in that browser's `localStorage`; nothing is uploaded anywhere.

## How to use it

1. Choose one topic or **Mixed set**.
2. Choose a mode:
   - **Practice** walks through every question in the chosen set and shows the
     answer and explanation immediately after each choice.
   - **Scored round** asks up to 10 random questions, scores them at the end, and
     shows a review of the questions you missed. Your last and best scored rounds
     are remembered in this browser.
3. Restart with **Play again** or pick another topic with **Choose another topic**.

Keyboard shortcuts during a round: `1`–`4` choose an answer (true/false uses
`1`–`2`), and `Enter` continues. All controls are normal buttons and radio
buttons, so they can be reached with `Tab` as well.

The layout is responsive and remains readable on narrow screens. Colours follow
the operating system's light or dark preference.

## Editing the question bank

Questions live in `questions.js`, separate from the UI code. Each question is an
object:

```js
{
  id: "java-01",                  // unique across the whole bank
  topic: "java",                  // must match a topic id
  type: "multiple-choice",        // or "true-false"
  prompt: "What executes Java bytecode?",
  options: ["A", "B", "C", "D"],  // exactly four for multiple-choice
  answer: 0,                      // index of the correct option
  explanation: "Short reason shown after answering."
}
```

True/false questions use `type: "true-false"`, `options: ["True", "False"]`, and
an `answer` of `0` (True) or `1` (False).

Topics are listed in the `TOPICS` array at the top of the same file. Adding a
topic means adding it there and using its `id` on questions.

## Validate the bank

From the repository root:

```sh
node quiz/validate.mjs
```

The check fails (nonzero exit) on duplicate topic or question ids, unknown
topics, a missing topic name or prompt, an empty explanation, a multiple-choice
question that does not have exactly four options, an out-of-range answer index,
malformed true/false options or answers, and a topic with fewer than 10
questions or without at least one multiple-choice and one true/false question.
Run it after editing questions.
