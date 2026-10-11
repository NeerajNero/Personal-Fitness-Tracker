"use client";

import { useState, useTransition } from "react";
import { regenerateLinkCode, unlinkTelegram } from "./actions";
import { btn, Card } from "./ui";

export function TelegramCard({ linked, code, bot }: { linked: boolean; code: string | null; bot: string | null }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Failed");
      setArmed(false);
    });
  };

  return (
    <Card title="Telegram" sub={linked ? "Linked — the bot accepts messages from your chat only." : "Not linked yet."}>
      {linked ? (
        armed ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm">Unlink this chat? Nudges stop until you link again.</span>
            <button type="button" disabled={pending} onClick={() => setArmed(false)} className={btn}>Keep</button>
            <button type="button" disabled={pending} onClick={() => run(unlinkTelegram)} className="h-11 rounded-xl bg-danger px-4 text-sm font-medium text-white">Unlink</button>
          </div>
        ) : (
          <button type="button" onClick={() => setArmed(true)} className={`${btn} w-full text-danger`}>Unlink Telegram</button>
        )
      ) : (
        <>
          <p className="text-sm text-muted">Send this to {bot ? <span className="font-medium text-fg">@{bot}</span> : "the bot"}:</p>
          <code className="mt-2 block select-all rounded-xl bg-bg px-4 py-3 text-center font-mono text-xl tracking-wider">/start {code ?? "—"}</code>
          <button type="button" disabled={pending} onClick={() => run(regenerateLinkCode)} className={`${btn} mt-3 w-full`}>Regenerate code</button>
        </>
      )}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </Card>
  );
}
