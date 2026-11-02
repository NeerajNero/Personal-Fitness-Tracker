import { exportCsv, isExportTable } from "@/lib/export";
import { requireUser } from "@/lib/session";

/** Session-gated CSV of one table, the signed-in user's rows only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/[table]">) {
  const userId = await requireUser();
  const { table } = await ctx.params;
  if (!isExportTable(table)) return new Response("Unknown table", { status: 404 });

  const { filename, body } = await exportCsv(userId, table);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
