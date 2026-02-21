import { NextResponse } from "next/server";
import { getAllDocuments, createDocument } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { getSession } from "@/lib/auth";

// GET /api/docs - List all documents
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const documents = await getAllDocuments(session.userId);
    return NextResponse.json(documents);
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

// POST /api/docs - Create a new document
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title, content, folder_id } = await request.json();
    const id = uuid();
    const document = await createDocument(session.userId, id, title || "Untitled Document", content || "", folder_id || null);
    return NextResponse.json(document);
  } catch (error) {
    console.error("Error creating document:", error);
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    );
  }
}


