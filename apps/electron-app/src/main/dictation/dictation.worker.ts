import { mkdir, open, rename } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";

import { LOCAL_DICTATION_MODELS } from "./localModels.js";
import type { OpenCodexDictationSettings } from "@open-codex-ui/opencodex-protocol";

interface WorkerInput {
  kind: "install" | "transcribe";
  directory: string;
  modelId: OpenCodexDictationSettings["modelId"];
  audioBase64?: string;
  language?: string;
}

const CONFIG_FILES = ["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", "preprocessor_config.json"];

/** Streams one pinned file to disk and validates model weights before inference can load them. */
async function downloadFile(input: WorkerInput, filename: string, expectedHash: string | undefined, index: number, count: number): Promise<void> {
  const model = LOCAL_DICTATION_MODELS[input.modelId];
  const url = `https://huggingface.co/${model.repository}/resolve/${model.revision}/${filename}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!response.ok || response.body === null) throw new Error(`Download failed (${response.status}): ${filename}`);
  const target = path.join(input.directory, filename);
  await mkdir(path.dirname(target), { recursive: true });
  const file = await open(`${target}.part`, "w");
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  const total = Number(response.headers.get("content-length"));
  let received = 0;
  let lastProgress = -1;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.length;
      if (received > 400 * 1024 * 1024) throw new Error("Model file exceeds its download limit.");
      hash.update(next.value);
      let offset = 0;
      while (offset < next.value.length) {
        const result = await file.write(next.value, offset, next.value.length - offset);
        offset += result.bytesWritten;
      }
      const fraction = total > 0 ? Math.min(received / total, 1) : 0;
      const progress = Math.floor((index + fraction) / count * 95);
      if (progress !== lastProgress) {
        lastProgress = progress;
        process.parentPort.postMessage({ type: "progress", progress });
      }
    }
  } finally {
    reader.releaseLock();
    await file.close();
  }
  if (expectedHash !== undefined && hash.digest("hex") !== expectedHash) {
    throw new Error(`Model checksum mismatch: ${filename}`);
  }
  await rename(`${target}.part`, target);
}

/** Installs or transcribes in a dedicated CPU worker; inference never downloads files. */
async function run(input: WorkerInput): Promise<void> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowRemoteModels = false;
  env.useFSCache = false;
  env.useBrowserCache = false;
  env.allowLocalModels = true;
  if (input.kind === "install") {
    const weights: Record<string, string> = LOCAL_DICTATION_MODELS[input.modelId].weights;
    const files = [...CONFIG_FILES, ...Object.keys(weights)];
    for (const [index, filename] of files.entries()) {
      await downloadFile(input, filename, weights[filename], index, files.length);
    }
  }
  const transcriber = await pipeline("automatic-speech-recognition", input.directory, {
    device: "cpu", dtype: "q8", local_files_only: true,
    session_options: { intraOpNumThreads: Math.min(4, availableParallelism()), interOpNumThreads: 1 }
  });
  let text = "";
  try {
    if (input.kind === "transcribe") {
      const bytes = Buffer.from(input.audioBase64 ?? "", "base64");
      const audio = new Float32Array(bytes.length / 2);
      for (let index = 0; index < audio.length; index += 1) audio[index] = bytes.readInt16LE(index * 2) / 32768;
      const options = { task: "transcribe", chunk_length_s: 30, stride_length_s: 5, language: undefined as string | undefined };
      if (input.language !== "auto") options.language = input.language;
      const result = await transcriber(audio, options);
      text = (Array.isArray(result) ? result[0]?.text : result.text) ?? "";
    }
  } finally {
    await transcriber.dispose();
  }
  process.parentPort.postMessage({ type: "done", text });
}

// A fresh utility process owns each job, including cancellation and native teardown.
process.parentPort.once("message", (event: { data: WorkerInput }) => {
  void run(event.data).catch((error: unknown) => {
    process.parentPort.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  });
});
