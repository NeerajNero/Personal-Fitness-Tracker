import type { Metadata } from "next";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Today</h1>
      <p className="mt-2 text-muted">Coming in a later build step.</p>
    </>
  );
}
