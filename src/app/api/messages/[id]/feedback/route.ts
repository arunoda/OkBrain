import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateMessageFeedback } from "@/lib/db";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { feedback } = body;

        // Validate feedback: 1 for good, -1 for bad, null to clear
        if (feedback !== 1 && feedback !== -1 && feedback !== null) {
            return NextResponse.json(
                { error: "Invalid feedback value" },
                { status: 400 }
            );
        }

        await updateMessageFeedback(session.userId, id, feedback);

        return NextResponse.json({ success: true, feedback });
    } catch (error: any) {
        if (error.message === 'Message not found') {
            return NextResponse.json({ error: "Message not found" }, { status: 404 });
        }
        if (error.message === 'Unauthorized to update message feedback') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }
        console.error("Error updating message feedback:", error);
        return NextResponse.json(
            { error: "Failed to update feedback" },
            { status: 500 }
        );
    }
}
