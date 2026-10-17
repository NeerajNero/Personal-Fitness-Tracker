/** Shared text formatting (client-safe). */
export const n0 = (n: number) => Math.round(n).toLocaleString("en-IN");
export const n1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-IN", { maximumFractionDigits: 1 });
export const qtyStr = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, ""));

/** Escape for Telegram HTML parse mode. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Serving label that marks a food row as a saved meal ("My meals"). */
export const MEAL_SERVING = "1 meal";
