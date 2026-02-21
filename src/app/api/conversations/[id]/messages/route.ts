import { NextResponse } from "next/server";
import { getConversationMessages, getMessageFileAttachments } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/conversations/[id]/messages - Get all messages for a conversation
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const messages = await getConversationMessages(session.userId, id);

    // Add file count to each message
    const messagesWithFileCount = await Promise.all(
      messages.map(async (message) => {
        const attachments = await getMessageFileAttachments(message.id);
        return {
          ...message,
          fileCount: attachments.length,
        };
      })
    );

    return NextResponse.json(messagesWithFileCount);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}


