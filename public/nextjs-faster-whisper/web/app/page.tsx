"use client";

import { FormEvent, useState } from "react";

type Result = {
  text: string;
  language: string;
  language_probability: number;
  duration: number;
  qwen?: {
    text: string;
    model: string;
  };
};

export default function Home() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Transcription failed.");
      }

      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Local Faster Whisper + Qwen</h1>
      <p className="muted">
        Upload audio or video. Whisper Small transcribes it, then Qwen 3B can
        translate or clean it on your Docker host.
      </p>

      <form onSubmit={submit}>
        <label htmlFor="file">Audio or video file</label>
        <input
          id="file"
          name="file"
          type="file"
          accept="audio/*,video/*"
          required
        />

        <label htmlFor="language">Spoken language</label>
        <select id="language" name="language" defaultValue="">
          <option value="">Auto-detect</option>
          <option value="en">English</option>
          <option value="de">German</option>
          <option value="hi">Hindi</option>
          <option value="ja">Japanese</option>
        </select>

        <label htmlFor="task">Task</label>
        <select id="task" name="task" defaultValue="transcribe">
          <option value="transcribe">Transcribe in original language</option>
          <option value="translate">Translate speech to English</option>
        </select>

        <label className="checkbox">
          <input name="use_qwen" type="checkbox" defaultChecked />
          <span>Process transcript with Qwen 3B</span>
        </label>

        <label htmlFor="target_language">Qwen target language</label>
        <input
          id="target_language"
          name="target_language"
          type="text"
          defaultValue="English"
          placeholder="English, Hindi, Japanese..."
        />

        <label htmlFor="instruction">Qwen instruction</label>
        <textarea
          id="instruction"
          name="instruction"
          defaultValue="Translate the transcript into clear English and lightly clean grammar."
          rows={4}
        />

        <button type="submit" disabled={loading}>
          {loading ? "Processing..." : "Start processing"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <section>
          <h2>Transcript</h2>
          <p className="muted">
            Detected: {result.language} · Confidence:{" "}
            {(result.language_probability * 100).toFixed(1)}% · Duration:{" "}
            {result.duration.toFixed(1)} seconds
          </p>
          <pre>{result.text}</pre>

          {result.qwen && (
            <>
              <h2>Qwen Output</h2>
              <p className="muted">Model: {result.qwen.model}</p>
              <pre>{result.qwen.text}</pre>
            </>
          )}
        </section>
      )}
    </main>
  );
}
