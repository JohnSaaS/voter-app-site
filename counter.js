// Anonymous completion counter. Sends only the district; the server sets the date.
import { safeStorage, DISTRICT_IDS } from "./district.js";

const URL = "https://wikeqozoeravyduqjvhm.supabase.co/rest/v1/voter_app_completions";
const KEY = "sb_publishable_V3tX3AaJ2qM_o3hD7uvIdw_H9B7MyEt"; // publishable: designed to be public

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

// Never throws, never logs, never retries. Counts a browser once per district per day.
// Local testing (file:// with empty hostname, localhost, 127.0.0.1, [::1], *.localhost) never posts.
export function recordCompletion(district, fetchFn = fetch, storage = safeStorage, host = (typeof location !== "undefined" ? location.hostname : "")) {
  try {
    if (!host || LOCAL_HOSTS.includes(host) || host.endsWith(".localhost")) return;
    if (!DISTRICT_IDS.includes(district)) return;
    const key = `va.counted.${district}.${today()}`;
    try {
      if (storage.getItem(key)) return;
      storage.setItem(key, "1");
    } catch (e) { /* storage failed: may count again */ }
    const p = fetchFn(URL, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ district }),
      keepalive: true,
    });
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) { /* swallow */ }
}
