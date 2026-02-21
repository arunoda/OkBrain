// API route for retrieving file attachments for a message

import { NextRequest, NextResponse } from "next/server";
import { getMessageFileAttachments, getMessage, getConversation } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: messageId } = await params;

    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    // Security: Check if message belongs to user
    const message = await getMessage(messageId);
    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    const conversation = await getConversation(session.userId, message.conversation_id);
    if (!conversation) {
      return NextResponse.json(
        { error: "Unauthorized access to message" },
        { status: 403 }
      );
    }

    const attachments = await getMessageFileAttachments(messageId);

    return NextResponse.json({
      success: true,
      attachments,
    });
  } catch (error: any) {
    console.error("[ATTACHMENTS] Failed to get attachments:", error);
    return NextResponse.json(
      { error: "Failed to retrieve attachments" },
      { status: 500 }
    );
  }
}
