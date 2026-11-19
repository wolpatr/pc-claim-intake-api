(function () {
  "use strict";

  var data = window.QuizData;
  var app = document.getElementById("app");
  var live = document.getElementById("live");

  if (!data || !Array.isArray(data.topics) || !Array.isArray(data.questions)) {
    app.textContent = "The question bank could not be loaded. Check that questions.js is next to index.html.";
    return;
  }

  var TOPICS = data.topics;
  var QUESTIONS = data.questions;
  var STORAGE_KEY = "pc-claim-quiz.v1";
  var SCORED_COUNT = 10;

  var state = {
    screen: "home",
    topicId: "mixed",
    mode: "practice",
    queue: [],
    index: 0,
    answers: [],
    selected: null,
    answered: false,
    current: null
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") {
          node.className = value;
        } else if (key === "text") {
          node.textContent = value;
        } else if (key.indexOf("on") === 0 && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
          node.setAttribute(key, "");
        } else {
          node.setAttribute(key, String(value));
        }
      });
    }
    if (children) {
      [].concat(children).forEach(function (child) {
        if (child === null || child === undefined) return;
        if (child.nodeType) node.appendChild(child);
        else node.appendChild(document.createTextNode(String(child)));
      });
    }
    return node;
  }

  function announce(message) {
    live.textContent = "";
    window.setTimeout(function () {
      live.textContent = message;
    }, 40);
  }

  function topicName(topicId) {
    if (topicId === "mixed") return "Mixed set";
    for (var i = 0; i < TOPICS.length; i += 1) {
      if (TOPICS[i].id === topicId) return TOPICS[i].name;
    }
    return "Unknown topic";
  }

  function questionCount(topicId) {
    if (topicId === "mixed") return QUESTIONS.length;
    return QUESTIONS.filter(function (q) {
      return q.topic === topicId;
    }).length;
  }

  function poolFor(topicId) {
    if (topicId === "mixed") return QUESTIONS.slice();
    return QUESTIONS.filter(function (q) {
      return q.topic === topicId;
    });
  }

  function shuffle(items) {
    var copy = items.slice();
    for (var i = copy.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function loadProgress() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveScore(entry) {
    try {
      var saved = loadProgress();
      saved.last = entry;
      if (!saved.best || entry.percent > saved.best.percent) {
        saved.best = entry;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (error) {
      /* Storage can be unavailable when the browser blocks local files. */
    }
  }

  function clearProgress() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* Nothing to clear if storage is unavailable. */
    }
  }

  function formatDate(timestamp) {
    try {
      return new Date(timestamp).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch (error) {
      return "";
    }
  }

  function startRound() {
    var pool = poolFor(state.topicId);
    var queue =
      state.mode === "scored"
        ? shuffle(pool).slice(0, Math.min(SCORED_COUNT, pool.length))
        : shuffle(pool);

    state.queue = queue;
    state.index = 0;
    state.answers = [];
    state.selected = null;
    state.answered = false;
    state.current = null;
    state.screen = "quiz";
    renderQuiz();
  }

  function renderHome() {
    state.screen = "home";
    state.current = null;
    document.title = "Claim Intake Study Quiz";
    app.replaceChildren();
    live.textContent = "";

    var form = el("form", { class: "screen", novalidate: true });

    var topicFieldset = el("fieldset", { class: "panel" }, [
      el("legend", { text: "1. Choose a topic" }),
      el("p", { class: "panel-hint", text: "Mixed set draws from every topic." })
    ]);

    var grid = el("div", { class: "topic-grid" });
    var topicChoices = [
      {
        id: "mixed",
        name: "Mixed set",
        blurb: "Random questions across all eight topics."
      }
    ].concat(
      TOPICS.map(function (topic) {
        return { id: topic.id, name: topic.name, blurb: topic.blurb };
      })
    );

    topicChoices.forEach(function (topic) {
      var input = el("input", {
        type: "radio",
        name: "topic",
        value: topic.id,
        checked: topic.id === state.topicId
      });
      var body = el("span", { class: "topic-body" }, [
        el("span", { class: "topic-name", text: topic.name }),
        el("span", { class: "topic-blurb", text: topic.blurb }),
        el("span", {
          class: "topic-blurb",
          text: questionCount(topic.id) + " questions"
        })
      ]);
      grid.appendChild(el("label", { class: "topic-card" }, [input, body]));
    });

    topicFieldset.appendChild(grid);

    var modeFieldset = el("fieldset", { class: "panel" }, [
      el("legend", { text: "2. Choose a mode" }),
      el("p", {
        class: "panel-hint",
        text: "Practice gives feedback after every answer. A scored round shows your result at the end."
      })
    ]);

    var modeRow = el("div", { class: "mode-row" });

    [
      {
        value: "practice",
        title: "Practice",
        note: "All questions in the topic, with the explanation after each answer."
      },
      {
        value: "scored",
        title: "Scored round",
        note: "Up to 10 random questions, scored at the end. Last and best scores are saved."
      }
    ].forEach(function (mode) {
      var input = el("input", {
        type: "radio",
        name: "mode",
        value: mode.value,
        checked: mode.value === state.mode
      });
      var body = el("span", { class: "mode-body" }, [
        el("span", { class: "mode-title", text: mode.title }),
        el("span", { class: "mode-note", text: mode.note })
      ]);
      modeRow.appendChild(el("label", { class: "mode-card" }, [input, body]));
    });

    modeFieldset.appendChild(modeRow);

    form.appendChild(topicFieldset);
    form.appendChild(modeFieldset);

    var submit = el("div", { class: "actions" }, [
      el("button", { type: "submit", class: "btn btn-primary", text: "Start" })
    ]);
    form.appendChild(submit);

    form.addEventListener("change", function (event) {
      if (event.target.name === "topic") state.topicId = event.target.value;
      if (event.target.name === "mode") state.mode = event.target.value;
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var topicInput = form.querySelector('input[name="topic"]:checked');
      var modeInput = form.querySelector('input[name="mode"]:checked');
      if (topicInput) state.topicId = topicInput.value;
      if (modeInput) state.mode = modeInput.value;
      startRound();
    });

    app.appendChild(form);

    var progress = loadProgress();
    if (progress.last || progress.best) {
      app.appendChild(buildScorePanel(progress));
    }
  }

  function buildScorePanel(progress) {
    var panel = el("section", { class: "score-panel", "aria-label": "Saved scores" });
    panel.appendChild(el("h2", { text: "Your scores in this browser" }));

    var grid = el("div", { class: "score-grid" });

    [
      { label: "Last round", entry: progress.last },
      { label: "Best round", entry: progress.best }
    ].forEach(function (item) {
      if (!item.entry) return;
      grid.appendChild(
        el("div", { class: "score-item" }, [
          el("span", { class: "score-label", text: item.label }),
          el("span", { class: "score-value", text: item.entry.percent + "%" }),
          el("span", {
            class: "score-detail",
            text:
              item.entry.correct +
              "/" +
              item.entry.total +
              " · " +
              topicName(item.entry.topicId) +
              " · " +
              formatDate(item.entry.at)
          })
        ])
      );
    });

    panel.appendChild(grid);

    panel.appendChild(
      el("div", { class: "actions" }, [
        el("button", {
          type: "button",
          class: "btn btn-quiet btn-small",
          text: "Clear saved scores",
          onclick: function () {
            clearProgress();
            renderHome();
            announce("Saved scores cleared.");
          }
        })
      ])
    );

    return panel;
  }

  function renderQuiz() {
    state.screen = "quiz";
    app.replaceChildren();
    live.textContent = "";

    var question = state.queue[state.index];
    if (!question) {
      renderHome();
      return;
    }

    var total = state.queue.length;
    var practice = state.mode === "practice";
    var last = state.index === total - 1;

    var screen = el("section", { class: "screen", "aria-label": "Quiz question" });

    var top = el("div", { class: "quiz-top" }, [
      el("div", {}, [
        el("p", {
          class: "quiz-meta",
          text:
            topicName(state.topicId) +
            " · " +
            (practice ? "Practice" : "Scored round")
        }),
        el("p", {
          class: "question-topic",
          text: "Question " + (state.index + 1) + " of " + total
        })
      ]),
      el("button", {
        type: "button",
        class: "btn btn-quiet btn-small",
        text: "Quit to start",
        onclick: function () {
          renderHome();
        }
      })
    ]);

    var progress = el(
      "div",
      {
        class: "progress",
        role: "progressbar",
        "aria-label": "Round progress",
        "aria-valuemin": "0",
        "aria-valuemax": String(total),
        "aria-valuenow": String(state.index + 1)
      },
      [
        el("div", {
          class: "progress-fill",
          style: "width: " + Math.round(((state.index + 1) / total) * 100) + "%"
        })
      ]
    );

    var panel = el("div", { class: "panel" });
    var heading = el("h2", {
      id: "question-heading",
      class: "question-heading",
      tabindex: "-1",
      text: question.prompt
    });
    panel.appendChild(heading);

    var options = el("div", {
      class: "options",
      role: "group",
      "aria-labelledby": "question-heading"
    });

    var optionButtons = question.options.map(function (optionText, index) {
      var button = el(
        "button",
        {
          type: "button",
          class: "option",
          "aria-pressed": "false",
          onclick: function () {
            selectOption(index);
          }
        },
        [
          el("span", { class: "option-key", text: String(index + 1) }),
          el("span", { class: "option-text", text: optionText })
        ]
      );
      options.appendChild(button);
      return button;
    });

    panel.appendChild(options);

    var next = el("button", {
      type: "button",
      class: "btn btn-primary",
      disabled: true,
      text: last
        ? practice
          ? "Finish practice"
          : "See results"
        : "Next question",
      onclick: function () {
        advance();
      }
    });

    var actions = el("div", { class: "actions" }, [next]);
    panel.appendChild(actions);

    panel.appendChild(
      el("p", { class: "kbd-hint" }, [
        "Keyboard: ",
        el("kbd", { text: "1" }),
        "–",
        el("kbd", { text: String(question.options.length) }),
        " choose an answer · ",
        el("kbd", { text: "Enter" }),
        " continue"
      ])
    );

    screen.appendChild(top);
    screen.appendChild(progress);
    screen.appendChild(panel);
    app.appendChild(screen);

    state.current = {
      question: question,
      optionButtons: optionButtons,
      nextButton: next,
      panel: panel
    };

    state.selected = null;
    state.answered = false;

    heading.focus();
  }

  function markPracticeOptions(question, selected) {
    var context = state.current;
    if (!context) return;

    context.optionButtons.forEach(function (button, index) {
      button.disabled = true;
      var label = null;

      if (index === question.answer) {
        button.classList.add("is-correct");
        label = "Correct answer";
      }
      if (index === selected && index !== question.answer) {
        button.classList.add("is-wrong");
        label = "Your answer";
      }
      if (label) {
        button.appendChild(el("span", { class: "option-flag", text: label }));
      }
    });
  }

  function buildFeedback(question, selected) {
    var correct = selected === question.answer;
    var box = el("div", {
      class: "feedback " + (correct ? "good" : "bad")
    });

    box.appendChild(
      el("p", {
        class: "feedback-title",
        text: correct ? "Correct" : "Not quite"
      })
    );

    if (!correct) {
      box.appendChild(
        el("p", { class: "answer-line" }, [
          "Correct answer: ",
          el("strong", { text: question.options[question.answer] })
        ])
      );
    }

    box.appendChild(el("p", { text: question.explanation }));
    return box;
  }

  function selectOption(index) {
    var context = state.current;
    if (!context) return;
    var question = context.question;
    if (index < 0 || index >= question.options.length) return;

    if (state.mode === "practice" && state.answered) return;

    state.selected = index;

    if (state.mode === "practice") {
      state.answered = true;
      markPracticeOptions(question, index);
      context.panel.insertBefore(
        buildFeedback(question, index),
        context.nextButton.parentNode
      );
      context.nextButton.disabled = false;
      announce(
        (index === question.answer ? "Correct. " : "Incorrect. ") +
          "Correct answer: " +
          question.options[question.answer]
      );
      context.nextButton.focus();
      return;
    }

    context.optionButtons.forEach(function (button, buttonIndex) {
      button.setAttribute("aria-pressed", buttonIndex === index ? "true" : "false");
    });
    context.nextButton.disabled = false;
    announce(
      "Selected option " +
        (index + 1) +
        ": " +
        question.options[index] +
        ". Press Enter or choose Next question."
    );
  }

  function advance() {
    var context = state.current;
    if (!context) return;

    var practice = state.mode === "practice";
    if (practice && !state.answered) return;
    if (!practice && state.selected === null) return;

    var question = context.question;
    state.answers.push({
      questionId: question.id,
      selected: state.selected,
      correct: state.selected === question.answer
    });

    state.index += 1;
    state.selected = null;
    state.answered = false;
    state.current = null;

    if (state.index >= state.queue.length) {
      showResults();
    } else {
      renderQuiz();
    }
  }

  function showResults() {
    state.screen = "results";
    state.current = null;

    var total = state.queue.length;
    var correct = state.answers.filter(function (answer) {
      return answer.correct;
    }).length;
    var percent = total ? Math.round((correct / total) * 100) : 0;
    var practice = state.mode === "practice";

    if (!practice) {
      saveScore({
        percent: percent,
        correct: correct,
        total: total,
        topicId: state.topicId,
        at: Date.now()
      });
    }

    renderResults({
      percent: percent,
      correct: correct,
      total: total,
      practice: practice
    });
  }

  function renderResults(summary) {
    app.replaceChildren();
    live.textContent = "";
    document.title =
      (summary.practice ? "Practice complete" : "Round complete") +
      " · Claim Intake Study Quiz";

    var screen = el("section", { class: "screen", "aria-label": "Results" });

    var hero = el("div", { class: "panel result-hero" });
    var heading = el("h2", {
      tabindex: "-1",
      text: summary.practice ? "Practice complete" : "Round complete"
    });
    hero.appendChild(heading);
    hero.appendChild(
      el("p", {
        class: "result-score",
        text: summary.percent + "%"
      })
    );
    hero.appendChild(
      el("p", {
        class: "result-line",
        text:
          summary.correct +
          " of " +
          summary.total +
          " correct · " +
          topicName(state.topicId) +
          (summary.practice ? " · practice round (not counted in saved scores)" : "")
      })
    );

    hero.appendChild(
      el("div", { class: "actions result-actions" }, [
        el("button", {
          type: "button",
          class: "btn btn-primary",
          text: "Play again",
          onclick: function () {
            startRound();
          }
        }),
        el("button", {
          type: "button",
          class: "btn",
          text: "Choose another topic",
          onclick: function () {
            renderHome();
          }
        })
      ])
    );

    screen.appendChild(hero);

    var missed = state.answers
      .filter(function (answer) {
        return !answer.correct;
      })
      .map(function (answer) {
        var question = null;
        for (var i = 0; i < QUESTIONS.length; i += 1) {
          if (QUESTIONS[i].id === answer.questionId) {
            question = QUESTIONS[i];
            break;
          }
        }
        return { answer: answer, question: question };
      })
      .filter(function (item) {
        return item.question;
      });

    if (missed.length > 0) {
      var review = el("section", { class: "panel" }, [
        el("h2", { text: "Review missed questions" }),
        el("p", {
          class: "panel-hint",
          text: "Read each explanation, then try the round again."
        })
      ]);

      var list = el("ul", { class: "missed-list" });
      missed.forEach(function (item) {
        var question = item.question;
        var answer = item.answer;
        var text =
          answer.selected === null || answer.selected === undefined
            ? "No answer"
            : question.options[answer.selected];

        var listItem = el("li", { class: "missed-item" }, [
          el("p", { class: "missed-prompt", text: question.prompt }),
          el("p", {}, [
            "Your answer: ",
            el("span", { class: "missed-yours", text: text })
          ]),
          el("p", {}, [
            "Correct answer: ",
            el("span", {
              class: "missed-answer",
              text: question.options[question.answer]
            })
          ]),
          el("p", { class: "missed-reason", text: question.explanation })
        ]);
        list.appendChild(listItem);
      });

      review.appendChild(list);
      screen.appendChild(review);
    } else {
      screen.appendChild(
        el("div", { class: "panel" }, [
          el("h2", { text: "Nothing missed" }),
          el("p", {
            class: "panel-hint",
            text: "Every answer was correct. Try a mixed set or another topic to keep testing."
          })
        ])
      );
    }

    app.appendChild(screen);
    heading.focus();
  }

  document.addEventListener("keydown", function (event) {
    if (state.screen !== "quiz") return;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    var target = event.target;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }

    var context = state.current;
    if (!context) return;
    var question = context.question;

    if (/^[1-9]$/.test(event.key)) {
      var optionIndex = Number(event.key) - 1;
      if (optionIndex < question.options.length) {
        if (state.mode === "practice" && state.answered) return;
        event.preventDefault();
        selectOption(optionIndex);
      }
      return;
    }

    if (event.key === "Enter") {
      var tag = target ? target.tagName : "";
      if (tag === "A") return;
      if (tag === "BUTTON" && !target.classList.contains("option")) return;
      if (state.answered || state.selected !== null) {
        event.preventDefault();
        advance();
      }
    }
  });

  renderHome();
})();
