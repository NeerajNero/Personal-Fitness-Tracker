import { z } from "zod";

/** Shared by onboarding and Settings → Body stats. */
export const bodyStatsSchema = z.object({
  weightKg: z.coerce.number().min(30, "30–300 kg").max(300, "30–300 kg"),
  heightCm: z.coerce.number().min(120, "120–250 cm").max(250, "120–250 cm"),
  age: z.coerce.number().int("Whole number").min(13, "13–100").max(100, "13–100"),
  sex: z.enum(["male", "female"], { message: "Pick one" }),
});
export type BodyStats = z.infer<typeof bodyStatsSchema>;
