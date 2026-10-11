/**
 * Call /api/tick locally. Reads .env (TICK_SECRET, optional TICK_URL — default http://localhost:3000).
 *   pnpm tick                 — real run
 *   pnpm tick:dry             — evaluate only
 *   pnpm tick force=day_close — force one rule (sends + logs)
 *   pnpm tick:dry force=morning_brief
 */
async function main() {
  const secret = process.env.TICK_SECRET;
  if (!secret) throw new Error("TICK_SECRET is not set");
  const args = process.argv.slice(2);
  const params = new URLSearchParams();
  if (args.includes("dry")) params.set("dry", "1");
  const force = args.find((a) => a.startsWith("force="))?.slice(6);
  if (force) params.set("force", force);
  const base = (process.env.TICK_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}/api/tick${params.size ? `?${params}` : ""}`, { headers: { "x-tick-secret": secret } });
  const body = await res.text();
  console.log(`${res.status} ${res.statusText}`);
  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
