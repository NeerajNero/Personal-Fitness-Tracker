# Design: tokens, type, icons, motion, copy

Read this before touching any screen. The app is a daily tracker two people open on their phones at the morning weigh-in,
at a meal, and at the gym or on a yoga mat. Its job is to make today's three things (eat, train, weigh) obvious and
satisfying to tick off, and its content is mostly numbers. Light, high-contrast, readable under gym lights and at 7 am.

## Tokens (`src/app/globals.css`, exposed to Tailwind as `bg-*` / `text-*` / `border-*`)
| Token | Light | Dark | Used for |
|---|---|---|---|
| `fg` | `#111318` | `#F2F3F5` | text, numbers |
| `bg` / `surface` | `#F3F4F6` / `#FFFFFF` | `#0E1013` / `#171A1F` | page / cards and inputs |
| `accent` (+ `accent-fg`) | `#2563EB` (`#FFFFFF`) | `#5B8DEF` (`#0B1220`) | **only** today's next action and progress: the primary button, the next-up icon, the kcal/protein bars, the active tab |
| `done` | `#3F6F5E` | `#7FB69F` | anything completed: ticks, logged rows, protein done, "Saved" |
| `muted` / `border` | `#6B7280` / `#E2E4E9` | `#9AA1AB` / `#262A31` | secondary text, labels / hairlines, empty bars |
| `danger` / `warn` | `#DC2626` / `#B45309` | `#F26D6D` / `#E0A33A` | over target, errors / stalls, budgets |
Dark mode follows the system (`prefers-color-scheme`); there is no toggle. No shadows anywhere: depth is a hairline border.

## Type
One typeface, **Manrope** (variable, `next/font/google`, `--font-manrope`), with tabular figures on for the whole page
(`font-feature-settings: "tnum"`), so numbers line up in rows and grids. The mono stack is the system one and appears only
in Diagnostics. Roles, as classes in `src/components/ui.tsx`:
- `hero` (2.75 rem / 800): the answer on a screen: kcal left, protein to go, today's steps, the 7-day weight.
- `big` (1.75 rem / 700): a section's number: the next workout's name, "3 of 6 logged", maintenance kcal.
- body 1 rem / 400; `label` 13 px / 500 muted for everything that describes a number.
Numbers are the hero: big where a number is the answer, small and quiet everywhere else. Hierarchy comes from size and
spacing. A bordered card (`Card`) appears only where it groups something; a single number or line sits bare.

## Icons (`src/components/icons.tsx`, lucide-react, 18 px, stroke 1.75, `ICON` props)
| Idea | Icon | Idea | Icon |
|---|---|---|---|
| Today / Train / Trends / Settings tabs | Sun / Dumbbell / TrendingUp / Settings | steps | Footprints |
| back / chest / shoulders / rear delts | Shirt / Shield / Mountain / Target | weigh-in | Scale |
| biceps / triceps | BicepsFlexed / ArrowDownToLine | meal | Utensils |
| quads / hamstrings / glutes / calves | ChevronsDown / Undo2 / Circle / ArrowUpFromLine | check / done | Check |
| posterior chain / core / other | Zap / Hexagon / Dumbbell | streak | Flame |
| veg / non-veg | Leaf / Drumstick | rest / time / cardio / repeat | Bed / Timer / Activity / RotateCcw |
A workout type's icon is its dominant muscle group (`dominantGroup` in `src/lib/routine.ts`). Disclosure uses ChevronDown,
day navigation ChevronLeft/Right, add Plus, remove X, more Ellipsis. Never append arrows to buttons or links.

## Motion: exactly one place
`.celebrate` (a 480 ms pop on the check icon) plays the moment a workout's last exercise is logged (Train header) or the
protein target is reached (Today). Both components remember whether the thing was already done when they mounted, so a
page that opens already complete does not animate. The keyframes sit inside `@media (prefers-reduced-motion: no-preference)`;
nothing else in the app transitions or animates (bars, chevrons and switches change state instantly).

## Copy
Sentence case, plain verbs ("Start Pull", "Log cardio", "Add a set"). Every empty state says what to do next ("Nothing
logged yet. Tap a meal above, or type one in."). Every error says what went wrong and how to fix it (the UI appends the
fix to the server's message: "Session not found. Reload the page and try again."). Meta is a sentence or separate spans,
never middle-dot strings. Progression hints are sentences: "Last 60 × 8/8/8, try 62.5 next" (`hintFromSets`).

## Layout per screen
- Login: wordmark, one line on what the app does, one Google button.
- Onboarding: one scrolling form, numbers in pairs, goal and place as big tappable choices, one Continue.
- Today: the workout card, then two hero numbers (kcal left, protein to go) with thin bars, weight and steps inline,
  cardio as one line, meals as chips, the log as a plain list.
- Train: the workout card, one row per exercise with a muscle icon and a tick, the set grid inline, cardio below.
- Trends: the verdict as a sentence (no box), the 7-day weight as a hero number over its chart, everything else under More.
- Settings: everyday cards first, setup as collapsed rows, Foods with veg / non-veg icons, Diagnostics plain at the bottom.

## Today's workout card (`src/components/workout-card.tsx`, data from `src/lib/workout-card.ts`)
Top of Today and Train. Day unset: the next type in rotation as the hero (icon, name, exercise count, estimated minutes
from `settings.session_minutes` or sets × 2.5 rounded to 5, "last done N days ago", the last top set of its first two
lifts), one primary **Start**, and a quiet **Something else** that opens the picker (other types, Rest, Custom, archived).
Started: "Pull, 3 of 6 done" (Continue / Open from Today; the session sits right below on Train). Rest day: the step
target as the hero with today's count, and a suggestion from the cardio log ("20-minute walk, like last Wednesday.").
No active types: "Set up your home plan" (home) or "Add a workout type" (gym) linking to Settings → Workout types, which
shows a banner that bodyweight plans arrive in the next release.

## Files
| File | Role |
|---|---|
| `src/app/globals.css` | Tokens, Tailwind theme, tnum, the one keyframe |
| `src/app/layout.tsx` | Manrope |
| `src/components/ui.tsx` | `primary`, `btn`, `link`, `input`, `chip`, `hero`, `big`, `label`, `Card`, `Heading`, `Empty`, `ErrorLine` |
| `src/components/icons.tsx` | `ICON`, `MUSCLE_ICON`, `MuscleIcon` and the named icons |
| `src/components/workout-card.tsx`, `day-picker.tsx`, `src/lib/workout-card.ts` | The card, the picker it opens, its data |
| `src/components/tab-bar.tsx`, `date-header.tsx` | Tabs and day navigation |
| `src/app/(app)/settings/ui.tsx` | Settings' `Field` and `Status`; re-exports the shared classes |
