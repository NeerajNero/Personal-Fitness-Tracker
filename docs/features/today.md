# Today screen (`/today`)

The food + body-metrics screen. It should take under 10 seconds to use, one-handed.

## What the owner sees (top → bottom)
1. **Date header**: ‹ › arrows; `?d=YYYY-MM-DD` for past days (never the future).
2. **Progress card**: kcal and protein bars plus one status line: kcal left/over · protein to go/✓ ·
   today's routine day (✓ / skipped / "today"), or steps on a rest day · smoke-free days. No ₹.
3. **Weight / steps**: two compact inputs that save on blur/Enter.
4. **My meals**: chips for favourite foods in the current phase. One tap logs 1 serving and shows a ×n badge.
   - **↺ Same as yesterday**: shown only while the day is empty; copies yesterday's whole log.
   - **All foods…**: the collapsed catalogue with search.
5. **Add a meal**: always open. Name + kcal + protein (optional) → Add. "Save to My meals" also stores it as a
   one-tap meal (saving again under the same name updates its numbers). This is where the owner types the numbers
   from their outside photo estimate.
6. **Logged**: tap a row → Delete, −/+ or typed servings.

## Behaviour rules
- A saved meal is a `foods` row with `serving_label = MEAL_SERVING` ("1 meal"). `saveMeal` refuses to overwrite a regular
  catalogue food with the same name.
- Copying is only allowed onto an empty day, so a double tap can't duplicate the log. The copied rows get the current time.
- Changing qty on a catalogue row recomputes from the food; on a manual row it scales proportionally.
- Manual entries store `cost_inr = 0`.

## Files
| File | Role |
|---|---|
| `src/app/(app)/today/page.tsx` | Loads DayState, the log and foods in parallel |
| `today/totals.tsx` | Progress card + status line |
| `today/metric-inputs.tsx` | Weight / steps |
| `today/food-section.tsx` | My meals, All foods, Add a meal, Logged list (client, optimistic) |
| `today/actions.ts` | `saveWeight`, `saveSteps`, `addFoodLog`, `quickAddFoodLog`, `copyPreviousDay`, `updateFoodLogQty`, `deleteFoodLog` |
| `src/lib/food.ts` | Shared writes: `entryFromFood`, `insertFoodEntries`, `saveMeal`, `copyFoodLog`, `deleteLatestFoodEntry` |

## Ideas not built
Whole-day templates (dropped because the owner mixes meals; My meals + Same as yesterday cover it).
