export function esFalloTemporal(error: { code?: string; message?: string }) {
  return !error.code || /^(08|40|53|57P|PGRST00)/.test(error.code)
    || /fetch failed|timeout|timed out|temporarily unavailable/i.test(error.message ?? "");
}
