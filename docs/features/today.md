# Today screen (`/today`)

The food + body-metrics screen. It should take under 10 seconds to use, one-handed.

## What the owner sees (top → bottom)
1. **Date header**: ‹ › arrows; `?d=YYYY-MM-DD` for past days (never the future).
2. **Today's workout** (`WorkoutCard`, shared with Train; [../design.md](../design.md#todays-workout-card)): the next type
   in rotation as the hero with Start and "Something else" (the picker: other types, Rest, Custom), "Pull, 3 of 6 done"
   with Continue once started, the step target with a cardio suggestion on rest days, or "Set up your home plan".
3. **Two hero numbers** (`totals.tsx`): kcal left (or over, in red) and protein to go (or done, in green with the tick that
   animates the moment it completes), each with a thin bar; steps on rest and unset days; the smoke-free streak when set.
4. **Weight / steps**: two inputs with their icons that save on blur/Enter; the number is the big thing in each.
5. **Cardio line**: "Cardio 20 min incline walk" when logged (links to Train); otherwise "Log cardio" plus a one-tap
   "Same as last time" repeat (`today/cardio-line.tsx`).
6. **My meals**: chips for favourite foods in the current phase. One tap logs 1 serving and shows a ×n badge.
   - **↺ Same as yesterday**: shown only while the day is empty; copies yesterday's whole log.
   - **All foods…**: the collapsed catalogue with search.
7. **Add a meal**: always open. Name + kcal + protein (optional) → Add. "Save to My meals" also stores it as a
   one-tap meal (saving again under the same name updates its numbers). This is where the owner types the numbers
   from their outside photo estimate.
8. **Logged**: tap a row → Delete, −/+ or typed servings.

## Behaviour rules
- A saved meal is a `foods` row with `serving_label = MEAL_SERVING` ("1 meal"). `saveMeal` refuses to overwrite a regular
  catalogue food with the same name.
- Copying is only allowed onto an empty day, so a double tap can't duplicate the log. The copied rows get the current time.
- Changing qty on a catalogue row recomputes from the food; on a manual row it scales proportionally.
- Manual entries store `cost_inr = 0`.

## Files
| File | Role |
|---|---|
| `src/app/(app)/today/page.tsx` | Loads the user's DayState, log, foods and workout types in parallel, then the workout card's data |
| `src/components/workout-card.tsx`, `day-picker.tsx`, `src/lib/workout-card.ts` + `src/app/(app)/day-actions.ts` | Today's workout card, the picker, its data, `chooseDay` (Today and Train) |
| `today/totals.tsx` | The two hero numbers, bars, steps and streak (client: the protein tick animates on completion) |
| `today/metric-inputs.tsx` | Weight / steps |
| `today/food-section.tsx` | My meals, All foods, Add a meal, Logged list (client, optimistic) |
| `today/actions.ts` | `saveWeight`, `saveSteps`, `addFoodLog`, `quickAddFoodLog`, `copyPreviousDay`, `updateFoodLogQty`, `deleteFoodLog` |
| `src/lib/food.ts` | Shared writes (all take `userId` first): `entryFromFood`, `insertFoodEntries`, `saveMeal`, `copyFoodLog`, `deleteFoodEntry` |

## Ideas not built
Whole-day templates (dropped because the owner mixes meals; My meals + Same as yesterday cover it).
