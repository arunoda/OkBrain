import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import { getUploadPath } from "@/lib/data-dir";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Path traversal protection
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = getUploadPath(filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  // Determine content type from extension
  let contentType = "application/octet-stream";
  if (filename.endsWith(".webp")) contentType = "image/webp";
  else if (filename.endsWith(".png")) contentType = "image/png";
  else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) contentType = "image/jpeg";
  else if (filename.endsWith(".gif")) contentType = "image/gif";

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
