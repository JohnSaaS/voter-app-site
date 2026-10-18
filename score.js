// Pure scoring and bill-picking functions. No DOM, no randomness.

const VOTE = { yes: "Yea", no: "Nay" };

export function pickBills(bills, topics, n = 15) {
  const queues = topics.map((t) => bills.filter((b) => b.card.topic === t));
  const picked = [];
  for (let round = 0; picked.length < n; round++) {
    let any = false;
    for (const q of queues) {
      if (round < q.length) {
        any = true;
        if (picked.length < n) picked.push(q[round]);
      }
    }
    if (!any) break;
  }
  return picked;
}

export function scoreIncumbent(answers, bills) {
  let agree = 0;
  let total = 0;
  for (const b of bills) {
    const want = VOTE[answers[b.card.id]];
    if (!want) continue;
    total++;
    if (b.incumbent_vote === want) agree++;
  }
  return { agree, total };
}

export function scoreChallenger(answers, bills) {
  let agree = 0;
  let total = 0;
  const bySource = { voted: 0, said: 0, estimate: 0 };
  for (const b of bills) {
    const want = VOTE[answers[b.card.id]];
    const ch = b.challenger || {};
    if (!want || !(ch.source in bySource)) continue;
    total++;
    bySource[ch.source]++;
    if (ch.position === want) agree++;
  }
  return { agree, total, bySource };
}

export function scoreLine(name, { agree, total }, estimated = false) {
  if (total === 0) {
    return estimated
      ? `No estimate for ${name} on these bills.`
      : "You haven't answered any bills yet.";
  }
  if (estimated) return `Estimated match with ${name}: ${agree} of ${total}.`;
  return `You and ${name} agreed on ${agree} of ${total} ${total === 1 ? "bill" : "bills"}.`;
}

export function sourceLine(bySource) {
  const defs = [
    ["voted", "past vote", "past votes"],
    ["said", "stated position", "stated positions"],
    ["estimate", "party estimate", "party estimates"],
  ];
  const parts = [];
  for (const [key, one, many] of defs) {
    const c = (bySource && bySource[key]) || 0;
    if (c > 0) parts.push(`${c} ${c === 1 ? one : many}`);
  }
  if (parts.length === 0) return "";
  let joined;
  if (parts.length === 1) joined = parts[0];
  else if (parts.length === 2) joined = parts.join(" and ");
  else joined = `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
  return `Based on ${joined}.`;
}
