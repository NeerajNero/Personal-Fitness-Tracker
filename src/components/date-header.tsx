import Link from "next/link";

type Props = { basePath: string; date: string; isToday: boolean; label: string; prev: string; next: string | null };

const arrow = "flex size-11 items-center justify-center rounded-full text-2xl text-muted active:bg-surface";

export function DateHeader({ basePath, date, isToday, label, prev, next }: Props) {
  return (
    <header className="flex items-center justify-between">
      <Link href={`${basePath}?d=${prev}`} aria-label="Previous day" className={arrow}>
        ‹
      </Link>
      <div className="text-center">
        <h1 className="text-2xl font-semibold leading-tight">{isToday ? "Today" : label}</h1>
        <p className="text-xs text-muted">{isToday ? label : date}</p>
      </div>
      {next ? (
        <Link href={isToday ? basePath : `${basePath}?d=${next}`} aria-label="Next day" className={arrow}>
          ›
        </Link>
      ) : (
        <span className={`${arrow} opacity-25`} aria-hidden>
          ›
        </span>
      )}
    </header>
  );
}
