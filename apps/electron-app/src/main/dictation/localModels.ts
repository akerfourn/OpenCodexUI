import type { OpenCodexDictationSettings } from "@open-codex-ui/opencodex-protocol";

/** Immutable upstream model revisions and checksums for the ONNX weights. */
export const LOCAL_DICTATION_MODELS = {
  "whisper-tiny": {
    "repository": "onnx-community/whisper-tiny",
    "revision": "ff4177021cc41f7db950912b73ea4fdf7d01d8e7",
    "weights": {
      "onnx/decoder_model_merged_quantized.onnx": "25e807a962b6349356d0ea5d0dfe530b7e5bf0e2a484aeca0359d03143faddd3",
      "onnx/encoder_model_quantized.onnx": "2af4a414ca47aa30f61246017e5fe82b0a8d229281d1255ba666a2a7f6b84d19"
    }
  },
  "whisper-base": {
    "repository": "onnx-community/whisper-base",
    "revision": "1846881b6b3a3024392c1eea3ad983695bc23925",
    "weights": {
      "onnx/decoder_model_merged_quantized.onnx": "fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b",
      "onnx/encoder_model_quantized.onnx": "5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46"
    }
  },
  "whisper-small": {
    "repository": "onnx-community/whisper-small",
    "revision": "36050c46d777d46dc4b5f43f6d90574fc38f8732",
    "weights": {
      "onnx/decoder_model_merged_quantized.onnx": "ec07c3cbb64172c39791e26ee870a65ac22b458c36722bfe2776b3dbf741e0c9",
      "onnx/encoder_model_quantized.onnx": "a43a83f3c5361cd591cfa7c36f14b43cf7cb22f47a415cc14a8d557be800fa92"
    }
  },
} satisfies Record<OpenCodexDictationSettings["modelId"], {
  repository: string; revision: string; weights: Record<string, string>;
}>;
