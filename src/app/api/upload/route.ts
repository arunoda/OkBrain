import { NextRequest, NextResponse } from "next/server";
import { statSync } from "fs";
import { v4 as uuid } from "uuid";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { getUploadPath, getFileUrl } from "@/lib/data-dir";
import { createUpload } from "@/lib/db";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only images (JPEG, PNG, GIF, WebP, HEIC, HEIF) are supported." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const filename = `${uuid()}.webp`;
    const outputPath = getUploadPath(filename);

    await sharp(buffer).webp({ quality: 80 }).toFile(outputPath);

    await createUpload(uuid(), session.userId, filename);

    const url = getFileUrl(filename);

    return NextResponse.json({
      url,
      filename,
      originalName: file.name,
      mimeType: "image/webp",
      size: statSync(outputPath).size,
    });
  } catch (error: any) {
    console.error("[UPLOAD] Failed:", error);
    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 }
    );
  }
}
