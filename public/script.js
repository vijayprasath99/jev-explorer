const PRESETS = [
  {
    name: "Support ticket triage",
    state:
      "Our API integration started returning 500 errors on every request about 20 minutes ago, and we can't process any customer orders until this is fixed.",
    model: "jev-latest",
    questions: [
      {
        key: "department",
        type: "choice",
        instructions: "Which team should handle this",
        options: [
          { name: "billing", desc: "Payment or subscription issues" },
          { name: "technical", desc: "Bugs or integration problems" },
          { name: "sales", desc: "Pricing or account questions" },
        ],
      },
      {
        key: "frustration",
        type: "score",
        instructions: "How frustrated the customer appears",
        levels: ["Calm, just stating facts", "Frustrated but civil", "Very angry, strong language"],
      },
      {
        key: "is_urgent",
        type: "noul",
        instructions: "The message conveys urgency or time-sensitivity",
        trueText: "",
        falseText: "",
      },
    ],
  },
  {
    name: "Simple yes/no",
    state: "Help! My payouts have been failing for 3 days.",
    model: "jev-latest",
    questions: [
      {
        key: "is_urgent",
        type: "noul",
        instructions: "Does this convey urgency?",
        trueText: "Explicitly time-sensitive",
        falseText: "No urgency expressed",
      },
    ],
  },
  {
    name: "Simple choice",
    state: "I love the new dashboard, but it's noticeably slower to load than the old one.",
    model: "jev-latest",
    questions: [
      {
        key: "sentiment",
        type: "choice",
        instructions: "What is the overall sentiment of this feedback?",
        options: [
          { name: "positive", desc: "Mostly praise" },
          { name: "negative", desc: "Mostly criticism" },
          { name: "mixed", desc: "Both praise and criticism" },
        ],
      },
    ],
  },
  {
    name: "Simple score",
    state: "This is the third time this week the deploy pipeline has failed on the same step.",
    model: "jev-latest",
    questions: [
      {
        key: "severity",
        type: "score",
        instructions: "How severe is this issue?",
        levels: ["Minor annoyance", "Moderate blocker", "Critical, blocking release"],
      },
    ],
  },
  {
    name: "Array state (chat log)",
    stateType: "array",
    stateItems: [
      "customer: My order hasn't shipped and it's been 5 days.",
      "agent: I'm sorry about that, let me look into it.",
      "customer: This is the second time this has happened.",
    ],
    model: "jev-latest",
    questions: [
      {
        key: "is_repeat_issue",
        type: "noul",
        instructions: "The customer mentions this has happened before",
        trueText: "",
        falseText: "",
      },
    ],
  },
  {
    name: "Object state (structured record)",
    stateType: "object",
    stateEntries: [
      { key: "account_age_days", value: "4" },
      { key: "plan", value: "free" },
      { key: "recent_logins", value: "0" },
    ],
    model: "jev-latest",
    questions: [
      {
        key: "churn_risk",
        type: "score",
        instructions: "How likely is this account to churn",
        levels: ["Low risk", "Medium risk", "High risk"],
      },
    ],
  },
];

const PLAINTEXT_EDITABLE_SUPPORTED = (() => {
  const probe = document.createElement("span");
  probe.contentEditable = "plaintext-only";
  return probe.contentEditable === "plaintext-only";
})();

let questionIdCounter = 0;
let questions = [];
const payloadState = {
  stateType: "string", // "string" | "array" | "object" | "json"
  state: "",
  stateItems: [""],
  stateEntries: [{ key: "", value: "" }],
  stateRaw: "{\n  \n}",
  stateRawError: "",
  model: "jev-latest",
};

const el = {
  configEndpoint: document.getElementById("config-endpoint"),
  configKeyStatus: document.getElementById("config-key-status"),
  presetList: document.getElementById("preset-list"),
  sampleToggle: document.getElementById("sample-response-toggle"),
  jsonEditor: document.getElementById("json-editor"),
  sendBtn: document.getElementById("send-btn"),
  sendError: document.getElementById("send-error"),
  responseMeta: document.getElementById("response-meta"),
  responseBody: document.getElementById("response-body"),
  logList: document.getElementById("log-list"),
};

// ---- JSON-editor primitives -------------------------------------------------
// Static punctuation (braces, quotes, colons, commas) is plain text.
// Editable content is rendered as inline contenteditable spans so the whole
// thing reads exactly like the request body, nothing more, nothing less.

function lineDiv(depth, extraClass) {
  const line = document.createElement("div");
  line.className = "json-line" + (extraClass ? ` ${extraClass}` : "");
  line.style.paddingLeft = `${depth * 18}px`;
  return line;
}

function punct(text) {
  const span = document.createElement("span");
  span.className = "punct";
  span.textContent = text;
  return span;
}

function editableSpan(cls, value, placeholder, onInput) {
  const span = document.createElement("span");
  span.className = cls;
  span.contentEditable = PLAINTEXT_EDITABLE_SUPPORTED ? "plaintext-only" : "true";
  span.textContent = value || "";
  if (placeholder) span.dataset.placeholder = placeholder;
  span.addEventListener("input", () => onInput(span.textContent));
  span.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  return span;
}

function staticKeyFrag(name) {
  const frag = document.createDocumentFragment();
  frag.appendChild(punct('"'));
  const key = document.createElement("span");
  key.className = "json-key";
  key.textContent = name;
  frag.appendChild(key);
  frag.appendChild(punct('"'));
  frag.appendChild(punct(": "));
  return frag;
}

function editableKeyFrag(value, placeholder, onInput) {
  const frag = document.createDocumentFragment();
  frag.appendChild(punct('"'));
  frag.appendChild(editableSpan("json-key json-key--editable", value, placeholder, onInput));
  frag.appendChild(punct('"'));
  frag.appendChild(punct(": "));
  return frag;
}

function valueFrag(value, placeholder, onInput) {
  const frag = document.createDocumentFragment();
  frag.appendChild(punct('"'));
  frag.appendChild(editableSpan("json-string json-string--editable", value, placeholder, onInput));
  frag.appendChild(punct('"'));
  return frag;
}

function comma() {
  return punct(",");
}

function removeButton(title, onClick, small) {
  const btn = document.createElement("button");
  btn.className = small ? "line-remove line-remove--small" : "line-remove";
  btn.type = "button";
  btn.title = title;
  btn.textContent = "×";
  btn.addEventListener("click", onClick);
  return btn;
}

function addRowButton(label, depth, onClick, disabled) {
  const row = lineDiv(depth, "json-line--add");
  const btn = document.createElement("button");
  btn.className = "json-add-btn";
  btn.type = "button";
  btn.textContent = `// + ${label}`;
  btn.disabled = Boolean(disabled);
  btn.addEventListener("click", onClick);
  row.appendChild(btn);
  return row;
}

// ---- Question data model ----------------------------------------------------

function newQuestion(type) {
  questionIdCounter += 1;
  const base = { id: questionIdCounter, key: `question_${questionIdCounter}`, type, instructions: "" };
  if (type === "noul") return { ...base, trueText: "", falseText: "" };
  if (type === "choice") return { ...base, options: [{ name: "", desc: "" }, { name: "", desc: "" }] };
  return { ...base, levels: ["", ""] };
}

function renderPresets() {
  el.presetList.innerHTML = "";
  PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.className = "preset-btn";
    btn.textContent = preset.name;
    btn.addEventListener("click", () => loadPreset(preset));
    el.presetList.appendChild(btn);
  });
}

function loadPreset(preset) {
  payloadState.stateType = preset.stateType || "string";
  payloadState.state = preset.state || "";
  payloadState.stateItems = preset.stateItems ? structuredClone(preset.stateItems) : [""];
  payloadState.stateEntries = preset.stateEntries
    ? structuredClone(preset.stateEntries)
    : [{ key: "", value: "" }];
  payloadState.stateRaw = preset.stateRaw || "{\n  \n}";
  payloadState.stateRawError = "";
  payloadState.model = preset.model;
  questions = preset.questions.map((q) => {
    questionIdCounter += 1;
    return { ...structuredClone(q), id: questionIdCounter };
  });
  renderJsonEditor();

  if (el.sampleToggle.checked) {
    showSampleResponse();
  } else {
    clearResponsePane();
  }
}

// ---- Rendering the whole request body as a live JSON editor ---------------

function renderJsonEditor() {
  const root = el.jsonEditor;
  root.innerHTML = "";

  root.appendChild(lineDiv(0)).appendChild(punct("{"));

  renderStateField(root);

  const modelLine = lineDiv(1);
  modelLine.appendChild(staticKeyFrag("model"));
  modelLine.appendChild(valueFrag(payloadState.model, "jev-latest", (v) => {
    payloadState.model = v;
  }));
  modelLine.appendChild(comma());
  root.appendChild(modelLine);

  const questionsOpen = lineDiv(1);
  questionsOpen.appendChild(staticKeyFrag("questions"));
  questionsOpen.appendChild(punct("{"));
  root.appendChild(questionsOpen);

  questions.forEach((q, idx) => renderQuestionBlock(root, q, idx === questions.length - 1));

  root.appendChild(
    addRowButton("add question", 2, () => {
      questions.push(newQuestion("choice"));
      renderJsonEditor();
    })
  );

  root.appendChild(lineDiv(1)).appendChild(punct("}"));
  root.appendChild(lineDiv(0)).appendChild(punct("}"));
}

// "state" can be a string, an array, or an object (the docs call it "the
// content to evaluate" — plain text, or structured data like a chat log or
// record). The type selector swaps which editor renders below it.

function stateKeyFrag(currentType, onTypeChange) {
  const frag = document.createDocumentFragment();
  frag.appendChild(punct('"'));
  const key = document.createElement("span");
  key.className = "json-key";
  key.textContent = "state";
  frag.appendChild(key);
  frag.appendChild(punct('"'));

  const select = document.createElement("select");
  select.className = "state-type-select";
  ["string", "array", "object", "json"].forEach((t) => {
    const option = document.createElement("option");
    option.value = t;
    option.textContent = t === "json" ? "json (raw)" : t;
    option.selected = t === currentType;
    select.appendChild(option);
  });
  select.addEventListener("change", (e) => onTypeChange(e.target.value));
  frag.appendChild(select);

  frag.appendChild(punct(": "));
  return frag;
}

function renderStateField(root) {
  const openLine = lineDiv(1);
  openLine.appendChild(
    stateKeyFrag(payloadState.stateType, (newType) => {
      payloadState.stateType = newType;
      renderJsonEditor();
    })
  );

  if (payloadState.stateType === "string") {
    openLine.appendChild(valueFrag(payloadState.state, "the content Jev evaluates against", (v) => {
      payloadState.state = v;
    }));
    openLine.appendChild(comma());
    root.appendChild(openLine);
    return;
  }

  if (payloadState.stateType === "json") {
    root.appendChild(openLine);
    renderStateRawEditor(root);
    return;
  }

  openLine.appendChild(punct(payloadState.stateType === "array" ? "[" : "{"));
  root.appendChild(openLine);

  if (payloadState.stateType === "array") {
    renderStateArrayItems(root);
  } else {
    renderStateObjectEntries(root);
  }

  const closeLine = lineDiv(1);
  closeLine.appendChild(punct(payloadState.stateType === "array" ? "]" : "}"));
  closeLine.appendChild(comma());
  root.appendChild(closeLine);
}

function renderStateArrayItems(root) {
  payloadState.stateItems.forEach((item, idx) => {
    const row = lineDiv(2);
    row.appendChild(valueFrag(item, `item ${idx}`, (v) => {
      payloadState.stateItems[idx] = v;
    }));
    if (idx < payloadState.stateItems.length - 1) row.appendChild(comma());
    if (payloadState.stateItems.length > 1) {
      row.appendChild(
        removeButton(
          "Remove item",
          () => {
            payloadState.stateItems.splice(idx, 1);
            renderJsonEditor();
          },
          true
        )
      );
    }
    root.appendChild(row);
  });

  root.appendChild(
    addRowButton("add item", 2, () => {
      payloadState.stateItems.push("");
      renderJsonEditor();
    })
  );
}

function renderStateObjectEntries(root) {
  payloadState.stateEntries.forEach((entry, idx) => {
    const row = lineDiv(2);
    row.appendChild(editableKeyFrag(entry.key, "field_name", (v) => {
      entry.key = v;
    }));
    row.appendChild(valueFrag(entry.value, "value", (v) => {
      entry.value = v;
    }));
    if (idx < payloadState.stateEntries.length - 1) row.appendChild(comma());
    if (payloadState.stateEntries.length > 1) {
      row.appendChild(
        removeButton(
          "Remove field",
          () => {
            payloadState.stateEntries.splice(idx, 1);
            renderJsonEditor();
          },
          true
        )
      );
    }
    root.appendChild(row);
  });

  root.appendChild(
    addRowButton("add field", 2, () => {
      payloadState.stateEntries.push({ key: "", value: "" });
      renderJsonEditor();
    })
  );
}

function validateJsonText(text) {
  try {
    JSON.parse(text);
    return "";
  } catch (err) {
    return err.message;
  }
}

function renderStateRawEditor(root) {
  const row = lineDiv(2, "json-line--raw");

  const textarea = document.createElement("textarea");
  textarea.className = "state-raw-textarea";
  textarea.spellcheck = false;
  textarea.value = payloadState.stateRaw;
  textarea.placeholder = '{\n  "any": ["arbitrarily", "nested", "json"]\n}';

  const status = document.createElement("div");
  status.className = "state-raw-status";

  function resize() {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function validate() {
    const err = validateJsonText(textarea.value);
    payloadState.stateRawError = err;
    status.textContent = err ? `Invalid JSON — ${err}` : "Valid JSON";
    status.classList.toggle("state-raw-status--error", Boolean(err));
    status.classList.toggle("state-raw-status--ok", !err);
  }

  textarea.addEventListener("input", () => {
    payloadState.stateRaw = textarea.value;
    resize();
    validate();
  });

  row.appendChild(textarea);
  root.appendChild(row);

  const statusLine = lineDiv(2, "json-line--raw-status");
  statusLine.appendChild(status);
  root.appendChild(statusLine);

  const trailLine = lineDiv(1);
  trailLine.appendChild(comma());
  root.appendChild(trailLine);

  requestAnimationFrame(resize);
  validate();
}

function renderQuestionBlock(root, q, isLast) {
  const openLine = lineDiv(2, "json-line--question-open");
  openLine.appendChild(editableKeyFrag(q.key, "question_key", (v) => {
    q.key = v;
  }));
  openLine.appendChild(punct("{"));
  openLine.appendChild(
    removeButton("Remove question", () => {
      questions = questions.filter((item) => item.id !== q.id);
      renderJsonEditor();
    })
  );
  root.appendChild(openLine);

  const typeLine = lineDiv(3);
  typeLine.appendChild(staticKeyFrag("type"));
  typeLine.appendChild(punct('"'));
  const select = document.createElement("select");
  select.className = "json-type-select";
  ["noul", "choice", "score"].forEach((t) => {
    const option = document.createElement("option");
    option.value = t;
    option.textContent = t;
    option.selected = t === q.type;
    select.appendChild(option);
  });
  select.addEventListener("change", (e) => {
    const replacement = newQuestion(e.target.value);
    replacement.id = q.id;
    replacement.key = q.key;
    replacement.instructions = q.instructions;
    Object.assign(q, replacement);
    renderJsonEditor();
  });
  typeLine.appendChild(select);
  typeLine.appendChild(punct('"'));
  typeLine.appendChild(comma());
  root.appendChild(typeLine);

  const instructionsLine = lineDiv(3);
  instructionsLine.appendChild(staticKeyFrag("instructions"));
  instructionsLine.appendChild(valueFrag(q.instructions, "What should Jev decide?", (v) => {
    q.instructions = v;
  }));
  instructionsLine.appendChild(comma());
  root.appendChild(instructionsLine);

  const criteriaOpen = lineDiv(3);
  criteriaOpen.appendChild(staticKeyFrag("criteria"));
  criteriaOpen.appendChild(punct(q.type === "score" ? "[" : "{"));
  root.appendChild(criteriaOpen);

  if (q.type === "noul") {
    renderNoulCriteria(root, q);
  } else if (q.type === "choice") {
    renderChoiceCriteria(root, q);
  } else {
    renderScoreCriteria(root, q);
  }

  const criteriaClose = lineDiv(3);
  criteriaClose.appendChild(punct(q.type === "score" ? "]" : "}"));
  root.appendChild(criteriaClose);

  const closeLine = lineDiv(2);
  closeLine.appendChild(punct("}"));
  if (!isLast) closeLine.appendChild(comma());
  root.appendChild(closeLine);
}

function renderNoulCriteria(root, q) {
  const trueLine = lineDiv(4);
  trueLine.appendChild(staticKeyFrag("true"));
  trueLine.appendChild(valueFrag(q.trueText, "description of the 'yes' outcome (optional)", (v) => {
    q.trueText = v;
  }));
  trueLine.appendChild(comma());
  root.appendChild(trueLine);

  const falseLine = lineDiv(4);
  falseLine.appendChild(staticKeyFrag("false"));
  falseLine.appendChild(valueFrag(q.falseText, "description of the 'no' outcome (optional)", (v) => {
    q.falseText = v;
  }));
  root.appendChild(falseLine);
}

function renderChoiceCriteria(root, q) {
  q.options.forEach((opt, idx) => {
    const row = lineDiv(4);
    row.appendChild(editableKeyFrag(opt.name, "option_name", (v) => {
      opt.name = v;
    }));
    row.appendChild(valueFrag(opt.desc, "description", (v) => {
      opt.desc = v;
    }));
    if (idx < q.options.length - 1) row.appendChild(comma());
    if (q.options.length > 2) {
      row.appendChild(
        removeButton(
          "Remove option",
          () => {
            q.options.splice(idx, 1);
            renderJsonEditor();
          },
          true
        )
      );
    }
    root.appendChild(row);
  });

  root.appendChild(
    addRowButton(
      "add option",
      4,
      () => {
        q.options.push({ name: "", desc: "" });
        renderJsonEditor();
      },
      q.options.length >= 255
    )
  );
}

function renderScoreCriteria(root, q) {
  q.levels.forEach((level, idx) => {
    const row = lineDiv(4);
    row.appendChild(valueFrag(level, `level ${idx}`, (v) => {
      q.levels[idx] = v;
    }));
    if (idx < q.levels.length - 1) row.appendChild(comma());
    if (q.levels.length > 2) {
      row.appendChild(
        removeButton(
          "Remove level",
          () => {
            q.levels.splice(idx, 1);
            renderJsonEditor();
          },
          true
        )
      );
    }
    root.appendChild(row);
  });

  root.appendChild(
    addRowButton(
      "add level",
      4,
      () => {
        q.levels.push("");
        renderJsonEditor();
      },
      q.levels.length >= 10
    )
  );
}

// ---- Building the real payload from the data model ------------------------

function buildQuestionsPayload() {
  const result = {};
  questions.forEach((q) => {
    const key = q.key && q.key.trim() ? q.key.trim() : `question_${q.id}`;
    const entry = { type: q.type, instructions: q.instructions };

    if (q.type === "noul") {
      if (q.trueText || q.falseText) {
        entry.criteria = {};
        if (q.trueText) entry.criteria.true = q.trueText;
        if (q.falseText) entry.criteria.false = q.falseText;
      }
    } else if (q.type === "choice") {
      entry.criteria = {};
      q.options.forEach((opt) => {
        if (opt.name && opt.name.trim()) entry.criteria[opt.name.trim()] = opt.desc || "";
      });
    } else {
      entry.criteria = q.levels.filter((level) => level && level.trim());
    }

    result[key] = entry;
  });
  return result;
}

function buildStateValue() {
  if (payloadState.stateType === "array") {
    return payloadState.stateItems.filter((item) => item && item.trim());
  }
  if (payloadState.stateType === "object") {
    const obj = {};
    payloadState.stateEntries.forEach((entry) => {
      if (entry.key && entry.key.trim()) obj[entry.key.trim()] = entry.value || "";
    });
    return obj;
  }
  if (payloadState.stateType === "json") {
    return JSON.parse(payloadState.stateRaw);
  }
  return payloadState.state;
}

function buildPayload() {
  return {
    state: buildStateValue(),
    model: payloadState.model || "jev-latest",
    questions: buildQuestionsPayload(),
  };
}

// ---- Sample responses (no network call) ------------------------------------

function approxTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(3, Math.round((text || "").length / 4));
}

function buildSampleAnswer(q) {
  if (q.type === "noul") {
    return { type: "noul", noul: 0.87 };
  }

  if (q.type === "choice") {
    const names = q.options.map((o) => o.name.trim()).filter(Boolean);
    if (names.length === 0) return { type: "choice", choice: "", probabilities: {}, confidence: 0 };
    const [winner, ...rest] = names;
    const probabilities = { [winner]: 0.82 };
    const share = rest.length ? Math.round((0.18 / rest.length) * 100) / 100 : 0;
    rest.forEach((name) => (probabilities[name] = share));
    return { type: "choice", choice: winner, probabilities, confidence: 0.81 };
  }

  // score
  const levels = q.levels.map((l) => l.trim()).filter(Boolean);
  if (levels.length === 0) return { type: "score", score: 0, legend: {}, probabilities: {}, confidence: 0 };
  const winnerIdx = Math.floor(levels.length / 2);
  const legend = {};
  const probabilities = {};
  levels.forEach((level, idx) => {
    legend[idx] = level;
    probabilities[idx] = idx === winnerIdx ? 0.7 : Math.round((0.3 / Math.max(levels.length - 1, 1)) * 100) / 100;
  });
  return { type: "score", score: winnerIdx, legend, probabilities, confidence: 0.75 };
}

function buildSampleResponse() {
  const answers = {};
  questions.forEach((q) => {
    const key = q.key && q.key.trim() ? q.key.trim() : `question_${q.id}`;
    answers[key] = buildSampleAnswer(q);
  });

  let stateValue;
  try {
    stateValue = buildStateValue();
  } catch {
    stateValue = payloadState.stateRaw;
  }
  const inputTokens =
    approxTokens(stateValue) + questions.reduce((sum, q) => sum + approxTokens(q.instructions), 0) + 40;
  const outputTokens = Math.max(10, questions.length * 18);

  return {
    model: "jev-1.13.0",
    answers,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function showSampleResponse() {
  el.responseMeta.innerHTML = `<span class="status-pill status--sample">SAMPLE</span>`;
  renderResponseBody(buildSampleResponse());
}

function clearResponsePane() {
  el.responseMeta.textContent = "No request sent yet.";
  el.responseBody.innerHTML = "";
}

// ---- Pretty-printing JSON with syntax highlighting -------------------------

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function syntaxHighlightJson(value) {
  const json = escapeHtml(JSON.stringify(value, null, 2));
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "resp-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "resp-key" : "resp-string";
      } else if (/true|false/.test(match)) {
        cls = "resp-boolean";
      } else if (/null/.test(match)) {
        cls = "resp-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function renderResponseBody(body) {
  if (typeof body === "string") {
    el.responseBody.textContent = body;
  } else {
    el.responseBody.innerHTML = syntaxHighlightJson(body);
  }
}

function statusClass(status) {
  if (status === 0) return "status--error";
  if (status >= 500) return "status--error";
  if (status >= 400) return "status--warn";
  return "status--ok";
}

function addLogEntry({ status, latencyMs }) {
  if (el.logList.querySelector(".log-empty")) el.logList.innerHTML = "";
  const entry = document.createElement("li");
  entry.className = "log-entry";
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `
    <span class="method method--post">POST</span>
    <span class="path">${time}</span>
    <span class="log-status ${statusClass(status)}">${status || "ERR"}</span>
    <span class="log-latency">${latencyMs}ms</span>
  `;
  el.logList.prepend(entry);
}

async function sendRequest() {
  el.sendError.textContent = "";

  let payload;
  try {
    payload = buildPayload();
  } catch (err) {
    el.sendError.textContent = `Fix the state JSON before sending — ${err.message}`;
    return;
  }

  el.sendBtn.disabled = true;
  el.sendBtn.textContent = "Sending…";
  el.responseMeta.textContent = "Waiting for Jev…";
  el.responseBody.innerHTML = "";

  const startedAt = performance.now();

  try {
    const response = await fetch("/api/jev-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    const data = await response.json();

    if (!response.ok) {
      el.responseMeta.innerHTML = `<span class="status-pill status--error">Proxy Error</span>`;
      el.responseBody.textContent = data.message || data.error || "The local proxy could not complete the request.";
      addLogEntry({ status: 0, latencyMs });
    } else {
      el.responseMeta.innerHTML = `
        <span class="status-pill ${statusClass(data.upstreamStatus)}">${data.upstreamStatus} ${data.upstreamStatusText}</span>
        <span class="latency">${latencyMs}ms</span>
      `;
      renderResponseBody(data.body);
      addLogEntry({ status: data.upstreamStatus, latencyMs });
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt);
    el.responseMeta.innerHTML = `<span class="status-pill status--error">Can't reach local service</span>`;
    el.responseBody.textContent =
      `${err.message}\n\n` +
      "The browser couldn't reach this page's own Node service. Make sure it's still " +
      "running (npm start) and that you're viewing this page at its http://localhost " +
      "address.";
    addLogEntry({ status: 0, latencyMs });
  }

  el.sendBtn.disabled = false;
  el.sendBtn.textContent = "Send Request";
}

// ---- Connection status (endpoint + whether a key is configured) -----------
// The actual key never reaches the browser — only whether one is set.

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    el.configEndpoint.textContent = config.endpoint;
    el.configKeyStatus.textContent = config.hasApiKey ? "configured" : "not set";
    el.configKeyStatus.classList.toggle("config-row__value--ok", config.hasApiKey);
    el.configKeyStatus.classList.toggle("config-row__value--warn", !config.hasApiKey);
    return config;
  } catch {
    el.configEndpoint.textContent = "unavailable";
    el.configKeyStatus.textContent = "unavailable";
    return null;
  }
}

el.sendBtn.addEventListener("click", sendRequest);
el.sampleToggle.addEventListener("change", () => {
  if (el.sampleToggle.checked) {
    showSampleResponse();
  } else {
    clearResponsePane();
  }
});

async function init() {
  const config = await loadConfig();
  const defaultModel = (config && config.model) || "jev-latest";
  PRESETS.forEach((preset) => {
    if (preset.model === "jev-latest") preset.model = defaultModel;
  });
  renderPresets();
  loadPreset(PRESETS[0]);
}

init();
