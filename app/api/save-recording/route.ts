import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No video file provided" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save directory inside public/recordings
    const publicDir = path.join(process.cwd(), "public");
    const recordingsDir = path.join(publicDir, "recordings");

    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    // Generate filename with timestamp or use provided filename
    const timestamp = Date.now();
    const customFilename = formData.get("filename") as string;
    const filename = customFilename || `camera-recording-${timestamp}.mp4`;
    const filePath = path.join(recordingsDir, filename);

    // Write file to public/recordings/
    await fs.promises.writeFile(filePath, buffer);

    const relativeUrl = `/recordings/${filename}`;

    return NextResponse.json({
      success: true,
      message: "Recording saved successfully",
      filename,
      filePath: relativeUrl,
      size: file.size,
      createdAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error saving recording:", error);
    return NextResponse.json(
      { error: "Failed to save recording", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const recordingsDir = path.join(process.cwd(), "public", "recordings");

    if (!fs.existsSync(recordingsDir)) {
      return NextResponse.json({ recordings: [] });
    }

    const files = await fs.promises.readdir(recordingsDir);
    const mp4Files = files
      .filter((file) => file.endsWith(".mp4") || file.endsWith(".webm"))
      .map((file) => {
        const stats = fs.statSync(path.join(recordingsDir, file));
        return {
          filename: file,
          url: `/recordings/${file}`,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ recordings: mp4Files });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
