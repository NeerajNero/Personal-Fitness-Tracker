# Today screen (`/today`)

The food + body-metrics screen. It should take under 10 seconds to use, one-handed.

## What the owner sees (top → bottom)
1. **Date header**: ‹ › arrows; `?d=YYYY-MM-DD` for past days (never the future).
2. **What's today?** (`DayPicker`, shared with Train): while unset, a button per active workout type with days since it was last
   done ("Pull · 4d", "new"), **next up** highlighted, plus 🛌 Rest. ⋯ shows Custom and archived types. Once chosen it collapses to
   one line ("Push · 2/5 logged · Open Train", or "🛌 Rest day") with **Change**.
3. **Progress card**: kcal and protein bars plus one status line: kcal left/over · protein to go/✓ ·
   steps (rest and unset days only) · smoke-free days. No ₹.
4. **Weight / steps**: two compact inputs that save on blur/Enter.
5. **My meals**: chips for favourite foods in the current phase. One tap logs 1 serving and shows a ×n badge.
   - **↺ Same as yesterday**: shown only while the day is empty; copies yesterday's whole log.
   - **All foods…**: the collapsed catalogue with search.
6. **Add a meal**: always open. Name + kcal + protein (optional) → Add. "Save to My meals" also stores it as a
   one-tap meal (saving again under the same name updates its numbers). This is where the owner types the numbers
   from their outside photo estimate.
7. **Logged**: tap a row → Delete, −/+ or typed servings.

## Behaviour rules
- A saved meal is a `foods` row with `serving_label = MEAL_SERVING` ("1 meal"). `saveMeal` refuses to overwrite a regular
  catalogue food with the same name.
- Copying is only allowed onto an empty day, so a double tap can't duplicate the log. The copied rows get the current time.
- Changing qty on a catalogue row recomputes from the food; on a manual row it scales proportionally.
- Manual entries store `cost_inr = 0`.

## Files
| File | Role |
|---|---|
| `src/app/(app)/today/page.tsx` | Loads DayState, the log, foods and workout types in parallel; session progress for the picker line |
| `src/components/day-picker.tsx` + `src/app/(app)/day-actions.ts` | Day picker + `chooseDay` action (Today and Train) |
| `today/totals.tsx` | Progress card + status line |
| `today/metric-inputs.tsx` | Weight / steps |
| `today/food-section.tsx` | My meals, All foods, Add a meal, Logged list (client, optimistic) |
| `today/actions.ts` | `saveWeight`, `saveSteps`, `addFoodLog`, `quickAddFoodLog`, `copyPreviousDay`, `updateFoodLogQty`, `deleteFoodLog` |
| `src/lib/food.ts` | Shared writes: `entryFromFood`, `insertFoodEntries`, `saveMeal`, `copyFoodLog`, `deleteLatestFoodEntry` |

## Ideas not built
Whole-day templates (dropped because the owner mixes meals; My meals + Same as yesterday cover it).
