import { pickBills, scoreIncumbent, scoreChallenger, scoreOther, scoreLine, sourceLine } from "./score.js";
import { lookupDistrict, safeStorage, DISTRICT_IDS, STATE_CODE, COVERED } from "./district.js";
import { recordCompletion } from "./counter.js";
import { safeHref, compact, billLabel, cleanSaved, makeTapGuard, shortQuizLine } from "./util.js";

const GROUPS = [
  { state: "42", heading: "Pennsylvania (Pittsburgh area)" },
  { state: "37", heading: "North Carolina (Charlotte area)" },
];
const KEY_DISTRICT = "va.district";
const KEY_ANSWERS = "va.answers";
const KEY_TOPICS = "va.topics";
const HOUSE_URL = "https://www.house.gov/representatives/find-your-representative";

const app = document.getElementById("app");
const footer = document.getElementById("footer");
const data = {}; // id -> district json
let district = null;
let topics = []; // chosen topics
let answers = {}; // bill id -> yes|no|skip
let queue = []; // bills to show as cards
let pos = 0;
let quizCount = null; // bills in the quiz just taken; null when results are opened without a quiz
let allAnswered = false; // Start pressed with nothing left to answer
const tapAllowed = makeTapGuard(700);
let lookingUp = false;

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") n.textContent = v;
    else if (k === "onclick") n.addEventListener("click", v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids) if (kid) n.append(kid);
  return n;
}

// Link to a JSON-supplied URL only when it is https; otherwise no link at all.
function link(url, text) {
  const h = safeHref(url);
  return h ? el("a", { href: h, target: "_blank", rel: "noopener", text }) : null;
}

function show(...nodes) {
  app.replaceChildren(...compact(nodes));
  app.focus();
  window.scrollTo(0, 0);
}

function save() {
  if (district) safeStorage.setItem(KEY_DISTRICT, district);
  safeStorage.setItem(KEY_ANSWERS, JSON.stringify(answers));
  safeStorage.setItem(KEY_TOPICS, JSON.stringify(topics));
}

function load() {
  try {
    const d = safeStorage.getItem(KEY_DISTRICT);
    if (DISTRICT_IDS.includes(d)) district = d;
    const a = JSON.parse(safeStorage.getItem(KEY_ANSWERS) || "{}");
    if (a && typeof a === "object") answers = a;
    const t = JSON.parse(safeStorage.getItem(KEY_TOPICS) || "[]");
    if (Array.isArray(t)) topics = t;
  } catch (e) {
    answers = {}; topics = [];
  }
}

function renderFooter(pulled) {
  footer.replaceChildren(
    el("p", {
      text:
        "Made by an independent volunteer. Not affiliated with any candidate or party. " +
        "Votes from the U.S. House Clerk; bill summaries from the Congressional Research Service. " +
        `Data pulled ${pulled}. ` +
        "This site stores no addresses or IP addresses, and your answers stay in your own browser. The hosting services keep their own standard logs.",
    })
  );
}

async function loadData() {
  await Promise.all(
    DISTRICT_IDS.map(async (id) => {
      try {
        const r = await fetch(`data/${id}.json`);
        if (r.ok) data[id] = await r.json();
      } catch (e) { /* district stays unavailable */ }
    })
  );
}

function pulledFor(id) {
  const d = (id && data[id]) || Object.values(data)[0];
  return d ? d.pulled : "(date unavailable)";
}

// ---------- District screen ----------
function districtScreen(message) {
  renderFooter(pulledFor(district));
  const input = el("input", { type: "text", id: "addr", name: "addr", autocomplete: "off", "aria-describedby": "addr-help" });
  const status = el("p", { role: "status", id: "status" });
  if (message) status.textContent = message;
  const go = el("button", { type: "button", text: "Find my district" });
  const picker = el("div", { id: "picker", hidden: true });
  const showPicker = () => { picker.hidden = false; renderPicker(picker); };

  const run = async () => {
    if (lookingUp || go.disabled) return;
    const value = input.value;
    if (!value.trim()) { status.textContent = "Please type your street address."; return; }
    go.disabled = true;
    lookingUp = true;
    status.textContent = "Looking up your district...";
    const id = await lookupDistrict(value);
    input.value = ""; // do not keep the address around
    go.disabled = false;
    lookingUp = false;
    if (id) { chooseDistrict(id); return; }
    status.textContent = "We could not match that address to a district this site covers. Please pick your district below.";
    showPicker();
  };
  go.addEventListener("click", run);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

  show(
    el("h2", { text: "Find your district" }),
    el("div", { class: "row" },
      el("label", { for: "addr", text: "Your street address" }),
      el("p", { id: "addr-help", text: "Include city and zip. Your address is sent to the U.S. Census Bureau only to find your district, and this site does not save it." }),
      input),
    el("div", { class: "row" }, go),
    status,
    el("button", { type: "button", class: "link-button", text: "Pick my district instead", onclick: showPicker }),
    picker
  );
  if (message) showPicker();
}

function districtLabel(id) {
  const d = data[id];
  const base = `${id.slice(0, 2)} District ${id.slice(3)}`;
  return d && d.incumbent ? `${base}: ${d.incumbent.name}` : base;
}

function renderPicker(box) {
  const groups = GROUPS.flatMap((g) => {
    const ids = COVERED[g.state].map((n) => `${STATE_CODE[g.state]}-${n}`);
    const items = ids.map((id) =>
      el("li", {}, el("button", { type: "button", class: "secondary", text: districtLabel(id), onclick: () => chooseDistrict(id) })));
    return [el("h4", { text: g.heading }), el("ul", { class: "plain" }, ...items)];
  });
  box.replaceChildren(
    el("h3", { text: "Pick your district" }),
    ...groups,
    el("p", {}, el("a", { href: HOUSE_URL, target: "_blank", rel: "noopener", text: "Not sure? Look up your representative on house.gov" }))
  );
  box.querySelectorAll("ul").forEach((u) => { u.style.listStyle = "none"; u.style.padding = "0"; });
  box.querySelectorAll("li").forEach((li) => { li.style.margin = "0.5rem 0"; });
  box.querySelectorAll("li button").forEach((b) => { b.style.width = "100%"; });
}

function chooseDistrict(id) {
  if (id !== district) { answers = {}; topics = []; }
  district = id;
  save();
  const d = data[id];
  if (!d) { show(el("div", { class: "message", text: "We could not load this district's data. Please try again later." })); return; }
  renderFooter(d.pulled);
  if (!d.bills || d.bills.length === 0) {
    show(
      el("h2", { text: `${id}: ${d.incumbent.name}` }),
      el("div", { class: "message", text: "We're still preparing this district's bills. Check back soon." }),
      el("button", { type: "button", class: "secondary", text: "Pick a different district", onclick: () => districtScreen() })
    );
    return;
  }
  topicsScreen();
}

// ---------- Topics screen ----------
function topicsScreen() {
  quizCount = null;
  allAnswered = false;
  const d = data[district];
  const boxes = d.topics.map((t, i) => {
    const cb = el("input", { type: "checkbox", id: `t${i}`, value: t });
    if (topics.includes(t)) cb.checked = true;
    return cb;
  });
  const start = el("button", { type: "button", text: "Start" });
  const update = () => { start.disabled = !boxes.some((b) => b.checked); };
  boxes.forEach((b) => b.addEventListener("change", update));
  update();
  start.addEventListener("click", () => {
    topics = boxes.filter((b) => b.checked).map((b) => b.value);
    startCards();
  });
  const fs = el("fieldset", { class: "topics" },
    el("legend", { text: "Which topics do you care about?" }),
    ...boxes.map((b, i) => el("label", { class: "topic", for: b.id }, b, el("span", { text: d.topics[i] }))));
  show(
    el("h2", { text: `${district}: ${d.incumbent.name}` }),
    fs,
    start,
    el("div", {}, el("button", { type: "button", class: "link-button", text: "Pick a different district", onclick: () => districtScreen() }))
  );
}

// ---------- Cards ----------
function startCards() {
  const d = data[district];
  const unanswered = d.bills.filter((b) => !(b.card.id in answers));
  queue = pickBills(unanswered, [...new Set(topics)], 15);
  pos = 0;
  quizCount = queue.length;
  allAnswered = queue.length === 0;
  save();
  if (queue.length === 0) { resultsScreen(); return; }
  cardScreen();
}

function sourceSection(heading, s) {
  return el("section", {},
    el("h3", { text: heading }),
    el("p", { text: s.text }),
    link(s.url, "Source") ? el("p", {}, link(s.url, "Source"), link(s.url2, "Source 2") ? " " : null, link(s.url2, "Source 2")) : null);
}

// Yes/No button: bold label, then the card's meaning line in normal weight. Same style for both.
function answerButton(label, meaning, onclick) {
  return el("button", { type: "button", class: "answer", onclick },
    el("strong", { class: "answer-label", text: label }),
    meaning ? el("span", { class: "answer-means", text: meaning }) : null);
}

function cardScreen() {
  const b = queue[pos];
  const c = b.card;
  const answer = (v) => {
    if (!tapAllowed()) return;
    app.querySelectorAll(".answers button").forEach((x) => { x.disabled = true; });
    answers[c.id] = v;
    save();
    pos++;
    if (pos >= queue.length) resultsScreen(); else cardScreen();
  };
  show(
    el("p", { class: "progress", text: `Bill ${pos + 1} of ${queue.length}` }),
    el("article", { class: "card" },
      el("h2", { text: c.heading }),
      el("p", { class: "official", text: `Official name: ${c.title} (${billLabel(c.id)})` }),
      el("section", {}, el("h3", { text: "What it changes" }), el("p", { text: c.changes })),
      sourceSection("Supporters say", c.supporters),
      sourceSection("Opponents say", c.opponents),
      el("div", { class: "answers" },
        answerButton("Yes", c.yes_means, () => answer("yes")),
        answerButton("No", c.no_means, () => answer("no")),
        el("button", { type: "button", text: "Skip", onclick: () => answer("skip") })))
  );
}

// ---------- Results ----------
const LABEL = { voted: "Voted", said: "Said", estimate: "Estimate, based on party", split: "Party split", none: "No record" };
const YOU = { yes: "Yes", no: "No", skip: "Skipped" };

// Muted meaning line after "You: Yes" or "You: No"; nothing when the field is missing.
function youMeaning(card, a) {
  const m = a === "yes" ? card.yes_means : a === "no" ? card.no_means : null;
  return m ? el("span", { class: "muted", text: ` (${m})` }) : null;
}

function resultsScreen() {
  const d = data[district];
  const bills = d.bills;
  const inc = d.incumbent;
  const ch = d.challenger;
  const inScore = scoreIncumbent(answers, bills);
  const chScore = scoreChallenger(answers, bills);
  const others = Array.isArray(d.others) ? d.others : [];
  // Once per browser per district per day (guarded in counter.js), so Add topics and rescoring do not recount.
  if (inScore.total >= 1) recordCompletion(district);

  const answered = bills.filter((b) => b.card.id in answers);
  const items = answered.map((b) => {
    const e = b.challenger || {};
    const label = LABEL[e.source] || "No record";
    const chText = e.position ? `${ch.name}: ${e.position} (${label})` : `${ch.name}: ${label}`;
    const chP = el("p", { class: "ch" }, document.createTextNode(chText));
    const chLink = link(e.url, "Link");
    if (chLink) chP.append(" ", chLink);
    return el("li", {},
      el("p", {}, el("strong", { text: b.card.heading })),
      el("p", {}, document.createTextNode(`You: ${YOU[answers[b.card.id]]}`), youMeaning(b.card, answers[b.card.id])),
      el("p", {}, document.createTextNode(`${inc.name}: ${b.incumbent_vote} `),
        link(b.rollcall && b.rollcall.url, "Official roll call")),
      chP);
  });

  const chBlock = el("section", { class: "challenger", "aria-label": `Estimated match with ${ch.name}` },
    el("p", { class: "score", text: scoreLine(ch.name, chScore, true) }),
    chScore.total > 0 ? el("p", { text: sourceLine(chScore.bySource) }) : null);

  const otherBlocks = others.map((o) => {
    const sc = scoreOther(bills, answers, o.entries);
    return el("section", { class: "challenger", "aria-label": `Also on the ballot: ${o.name}` },
      el("p", { text: `Also on the ballot: ${o.name} (${o.party}).` }),
      sc.counted >= 1 ? el("p", { text: `${o.name}'s stated positions: you agreed on ${sc.agreed} of ${sc.counted}.` }) : null);
  });

  show(
    el("h2", { text: "Your results" }),
    el("p", { class: "score", text: scoreLine(inc.name, inScore) }),
    chBlock,
    ...otherBlocks,
    allAnswered ? el("p", { text: "You've answered every bill in these topics." }) : null,
    shortQuizLine(quizCount) ? el("p", { text: shortQuizLine(quizCount) }) : null,
    inc.note ? el("p", { class: "note", text: inc.note }) : null,
    el("h2", { text: "Bill by bill" }),
    el("ul", { class: "bills" }, ...items),
    el("div", { class: "row" }, el("button", { type: "button", text: "Add topics", onclick: () => topicsScreen() })),
    el("div", {}, el("button", { type: "button", class: "link-button", text: "Pick a different district", onclick: () => districtScreen() }))
  );
}

// ---------- Start ----------
async function init() {
  load();
  await loadData();
  renderFooter(pulledFor(district));
  if (district && data[district]) {
    const d = data[district];
    if (!d.bills || d.bills.length === 0) { chooseDistrict(district); return; }
    const clean = cleanSaved(topics, answers, d);
    topics = clean.topics;
    answers = clean.answers;
    save();
    if (topics.length > 0 && Object.keys(answers).length > 0) { resultsScreen(); return; }
    topicsScreen();
    return;
  }
  districtScreen();
}
init();
