import { getSession } from "@/lib/auth";
import { getLatestFactSheet } from "@/lib/db";
import type { FactSheetEntry } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sheet = await getLatestFactSheet(session.userId);
  if (!sheet) {
    return new Response(JSON.stringify(null), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const facts: FactSheetEntry[] = JSON.parse(sheet.facts_json);
  const dedupLog: string[] | null = sheet.dedup_log ? JSON.parse(sheet.dedup_log) : null;

  // SQLite CURRENT_TIMESTAMP is UTC but lacks 'Z' suffix — append it so JS parses correctly
  const createdAt = sheet.created_at.endsWith('Z') ? sheet.created_at : sheet.created_at + 'Z';

  return new Response(
    JSON.stringify({
      facts,
      created_at: createdAt,
      fact_count: sheet.fact_count,
      dedup_log: dedupLog,
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}
