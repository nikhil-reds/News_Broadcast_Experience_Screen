export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 200 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const incoming = await request.formData();
    const file = incoming.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Audio file is required." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "File is larger than 200 MB." },
        { status: 413 },
      );
    }

    const outgoing = new FormData();
    outgoing.append("file", file, file.name);
    outgoing.append("task", String(incoming.get("task") ?? "transcribe"));
    outgoing.append(
      "instruction",
      String(
        incoming.get("instruction") ??
          "Translate the transcript into clear English and lightly clean grammar.",
      ),
    );

    const language = incoming.get("language");
    if (language) {
      outgoing.append("language", String(language));
    }

    const targetLanguage = incoming.get("target_language");
    if (targetLanguage) {
      outgoing.append("target_language", String(targetLanguage));
    }

    const whisperUrl =
      process.env.WHISPER_API_URL ?? "http://localhost:8000";

    const endpoint = incoming.get("use_qwen") ? "process" : "transcribe";
    const response = await fetch(`${whisperUrl}/${endpoint}`, {
      method: "POST",
      body: outgoing,
      cache: "no-store",
    });

    const body = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: body.detail ?? "Transcription failed." },
        { status: response.status },
      );
    }

    return Response.json(body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
