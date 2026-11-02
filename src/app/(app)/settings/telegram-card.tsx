"use client";

import { useState, useTransition } from "react";
import { Bot } from "lucide-react";
import { ICON } from "@/components/icons";
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
      if (!r.ok) setError(`${r.error ?? "Couldn't save"}. Reload the page and try again.`);
      setArmed(false);
    });
  };

  return (
    <Card title="Telegram" sub={linked ? "Linked. The bot answers your chat only." : "Not linked yet. Most days you'll log from here."}>
      {linked ? (
        armed ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm">Unlink this chat? Reminders stop until you link again.</span>
            <button type="button" disabled={pending} onClick={() => setArmed(false)} className={btn}>Keep</button>
            <button type="button" disabled={pending} onClick={() => run(unlinkTelegram)} className="h-11 rounded-xl bg-danger px-4 text-sm font-medium text-white">Unlink</button>
          </div>
        ) : (
          <button type="button" onClick={() => setArmed(true)} className={`${btn} w-full text-danger`}>Unlink Telegram</button>
        )
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-sm text-muted"><Bot {...ICON} /> Send this to {bot ? <span className="font-medium text-fg">@{bot}</span> : "the bot"}:</p>
          <p className="mt-2 select-all rounded-xl bg-bg px-4 py-3 text-center text-xl font-bold tracking-widest">/start {code ?? "—"}</p>
          <button type="button" disabled={pending} onClick={() => run(regenerateLinkCode)} className={`${btn} mt-3 w-full`}>Make a new code</button>
        </>
      )}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </Card>
  );
}
