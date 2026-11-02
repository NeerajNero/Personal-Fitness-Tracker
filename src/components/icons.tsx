/**
 * The icon vocabulary (docs/design.md): lucide, 18 px, stroke 1.75, one icon per idea so screens stay consistent.
 * Import lucide icons through here (or directly with `ICON`) so every icon shares the same size and stroke.
 */
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, Bed, BicepsFlexed, Check, ChevronsDown, Circle, Drumstick, Dumbbell, Flame, Footprints,
  Hexagon, Leaf, Mountain, RotateCcw, Scale, Shield, Shirt, Target, Timer, Undo2, Utensils, Zap, type LucideIcon, type LucideProps,
} from "lucide-react";

export const ICON = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;

/** One icon per muscle group (`exercises.muscle_group`); unknown groups fall back to the dumbbell. */
export const MUSCLE_ICON: Record<string, LucideIcon> = {
  back: Shirt,
  chest: Shield,
  shoulders: Mountain,
  "rear delts": Target,
  biceps: BicepsFlexed,
  triceps: ArrowDownToLine,
  quads: ChevronsDown,
  hamstrings: Undo2,
  glutes: Circle,
  calves: ArrowUpFromLine,
  "posterior chain": Zap,
  core: Hexagon,
  other: Dumbbell,
};

export function MuscleIcon({ group, ...props }: { group: string } & LucideProps) {
  const Icon = MUSCLE_ICON[group.toLowerCase()] ?? Dumbbell;
  return <Icon {...ICON} {...props} />;
}

export const VegIcon = (p: LucideProps) => <Leaf {...ICON} {...p} />;
export const NonVegIcon = (p: LucideProps) => <Drumstick {...ICON} {...p} />;
export const StepsIcon = (p: LucideProps) => <Footprints {...ICON} {...p} />;
export const WeighIcon = (p: LucideProps) => <Scale {...ICON} {...p} />;
export const MealIcon = (p: LucideProps) => <Utensils {...ICON} {...p} />;
export const CheckIcon = (p: LucideProps) => <Check {...ICON} {...p} />;
export const StreakIcon = (p: LucideProps) => <Flame {...ICON} {...p} />;
export const RestIcon = (p: LucideProps) => <Bed {...ICON} {...p} />;
export const TimeIcon = (p: LucideProps) => <Timer {...ICON} {...p} />;
export const LiftIcon = (p: LucideProps) => <Dumbbell {...ICON} {...p} />;
export const CardioIcon = (p: LucideProps) => <Activity {...ICON} {...p} />;
export const RepeatIcon = (p: LucideProps) => <RotateCcw {...ICON} {...p} />;
