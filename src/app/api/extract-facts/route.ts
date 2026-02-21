import { getSession } from "@/lib/auth";
import { getConversation } from "@/lib/db";
import { extractFactsFromConversation } from "@/lib/ai/facts";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { conversationId } = await request.json();

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: "Conversation ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const conversation = await getConversation(session.userId, conversationId);
    if (!conversation) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await extractFactsFromConversation(conversationId);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Extract facts error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to extract facts" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
