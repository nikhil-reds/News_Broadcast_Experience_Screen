import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Directory path inside public/audio
    const publicDir = path.join(process.cwd(), "public");
    const audioDir = path.join(publicDir, "audio");

    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = Date.now();
    const customFilename = formData.get("filename") as string;
    const filename = customFilename || `master-audio-${timestamp}.wav`;
    const filePath = path.join(audioDir, filename);

    // Save audio file to public/audio/
    await fs.promises.writeFile(filePath, buffer);

    const relativeUrl = `/audio/${filename}`;

    return NextResponse.json({
      success: true,
      message: "Audio saved successfully in public/audio/",
      filename,
      filePath: relativeUrl,
      size: file.size,
      createdAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error saving audio:", error);
    return NextResponse.json(
      { error: "Failed to save audio recording", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const audioDir = path.join(process.cwd(), "public", "audio");

    if (!fs.existsSync(audioDir)) {
      return NextResponse.json({ audioFiles: [] });
    }

    const files = await fs.promises.readdir(audioDir);
    const audioFiles = files
      .filter((file) => file.endsWith(".wav") || file.endsWith(".mp3") || file.endsWith(".webm") || file.endsWith(".m4a"))
      .map((file) => {
        const stats = fs.statSync(path.join(audioDir, file));
        return {
          filename: file,
          url: `/audio/${file}`,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ audioFiles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
