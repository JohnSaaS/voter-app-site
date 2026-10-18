// Small pure helpers, testable without a DOM.

// Return u only if it is an https URL string; otherwise null (render no link).
export function safeHref(u) {
  return typeof u === "string" && /^https:\/\//.test(u) ? u : null;
}

// Drop falsy entries (null, undefined, false, "") so they never become text nodes.
export function compact(nodes) {
  return nodes.filter(Boolean);
}

const BILL_TYPES = {
  hr: "H.R.", hres: "H.Res.", hjres: "H.J.Res.", hconres: "H.Con.Res.",
  s: "S.", sjres: "S.J.Res.", sconres: "S.Con.Res.",
};

// "118-hr-6976" -> "H.R. 6976". Unknown forms come back as the raw id.
export function billLabel(id) {
  if (typeof id !== "string") return "";
  const m = /^\d+-([a-z]+)-(\d+)$/.exec(id);
  if (!m || !Object.prototype.hasOwnProperty.call(BILL_TYPES, m[1])) return id;
  return `${BILL_TYPES[m[1]]} ${m[2]}`;
}

// Keep only saved topics and answers that still exist in this district's data.
export function cleanSaved(topics, answers, district) {
  const validTopics = new Set((district && district.topics) || []);
  const validIds = new Set(((district && district.bills) || []).map((b) => b.card.id));
  const outTopics = Array.isArray(topics) ? topics.filter((t) => validTopics.has(t)) : [];
  const outAnswers = {};
  if (answers && typeof answers === "object") {
    for (const [id, v] of Object.entries(answers)) {
      if (validIds.has(id) && ["yes", "no", "skip"].includes(v)) outAnswers[id] = v;
    }
  }
  return { topics: outTopics, answers: outAnswers };
}

// Double-tap guard. Returns allow(): true if at least gapMs passed since the last accepted call.
export function makeTapGuard(gapMs = 700, now = () => Date.now()) {
  let last = null;
  return function allow() {
    const t = now();
    if (last !== null && t - last < gapMs) return false;
    last = t;
    return true;
  };
}

// Short-quiz note: shown only when fewer than max bills were available.
export function shortQuizLine(n, max = 15) {
  if (!Number.isInteger(n) || n < 1 || n >= max) return null;
  return `These topics had ${n} ${n === 1 ? "bill" : "bills"} from this member's record.`;
}
