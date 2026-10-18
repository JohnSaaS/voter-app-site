// District lookup via the Census geocoder (JSONP; the geocoder blocks CORS).
// The address is used only to build the request URL. It is never stored or logged.

const CENSUS = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const DISTRICTS = new Set(["12", "14", "17"]);

export function buildUrl(address, callbackName) {
  return (
    `${CENSUS}?address=${encodeURIComponent(address)}` +
    `&benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=jsonp` +
    `&callback=${encodeURIComponent(callbackName)}`
  );
}

let counter = 0;

// Real loader: url may already contain a callback param only if the caller built it;
// here we append our own unique callback when the url has none.
export function loadJsonp(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const name = `__voterJsonp${Date.now().toString(36)}${counter++}`;
    const u = new URL(url);
    u.searchParams.set("callback", name);
    const script = document.createElement("script");
    let timer = null;
    const cleanup = (keepNoop) => {
      clearTimeout(timer);
      try { script.remove(); } catch (e) { /* ignore */ }
      // After a timeout, leave a no-op so a late response does not throw.
      if (keepNoop) { window[name] = () => {}; return; }
      try { delete window[name]; } catch (e) { window[name] = undefined; }
    };
    window[name] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("script error")); };
    timer = setTimeout(() => { cleanup(true); reject(new Error("timeout")); }, timeoutMs);
    script.src = u.toString();
    document.head.appendChild(script);
  });
}

function parse(data) {
  const match = data && data.result && data.result.addressMatches && data.result.addressMatches[0];
  const geos = match && match.geographies;
  if (!geos) return null;
  const key = Object.keys(geos).find((k) => /Congressional Districts/.test(k));
  const row = key && Array.isArray(geos[key]) ? geos[key][0] : null;
  if (!row || row.STATE !== "42" || !DISTRICTS.has(row.BASENAME)) return null;
  return `PA-${row.BASENAME}`;
}

// loadFn(url) -> Promise<object>. Returns "PA-12" | "PA-14" | "PA-17" | null.
export async function lookupDistrict(address, loadFn = loadJsonp, timeoutMs = 12000) {
  if (typeof address !== "string" || address.trim() === "") return null;
  let timer;
  try {
    const url = buildUrl(address.trim(), "cb");
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), timeoutMs); });
    const data = await Promise.race([Promise.resolve().then(() => loadFn(url)), timeout]);
    return parse(data);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// localStorage wrapper that falls back to memory. Holds only answers and district, never the address.
const mem = new Map();
function ls() {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}
export const safeStorage = {
  getItem(k) {
    try { const s = ls(); if (s) { const v = s.getItem(k); if (v !== null && v !== undefined) return v; } } catch (e) { /* fall through */ }
    return mem.has(k) ? mem.get(k) : null;
  },
  setItem(k, v) {
    mem.set(k, String(v));
    try { const s = ls(); if (s) s.setItem(k, String(v)); } catch (e) { /* memory only */ }
  },
  removeItem(k) {
    mem.delete(k);
    try { const s = ls(); if (s) s.removeItem(k); } catch (e) { /* ignore */ }
  },
};
