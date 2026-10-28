// The speech models dictation can download: whisper.cpp builds of OpenAI Whisper (MIT), from
// ggerganov/whisper.cpp on Hugging Face. Sizes and sha256 are the LFS values for these exact files.
'use strict';

const MODELS = [
  {
    id: 'whisper-turbo',
    label: 'Standard',
    file: 'ggml-large-v3-turbo-q5_0.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    bytes: 574041195,
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    sub: 'Most accurate. Best on Apple Silicon.',
    license: 'MIT',
  },
  {
    id: 'whisper-small-en',
    label: 'Light',
    file: 'ggml-small.en-q5_1.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin',
    bytes: 190098681,
    sha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
    sub: 'Smaller and quicker on older computers. English only.',
    license: 'MIT',
  },
];

// Silero VAD (MIT), bundled next to this file: tells speech from silence and noise, so Whisper
// never sees a stretch with nobody talking (it tends to invent words for those).
const VAD_FILE = 'silero-v6.2.0.bin';

function getModel(id) {
  return MODELS.find((m) => m.id === id) || null;
}

// Whisper's encoder is heavy without a GPU. The native builds we ship use Metal on Apple Silicon
// and the CPU everywhere else (the CUDA/Vulkan variants are left out of the app).
function recommendedFor({ platform = process.platform, arch = process.arch } = {}) {
  return platform === 'darwin' && arch === 'arm64' ? 'whisper-turbo' : 'whisper-small-en';
}

module.exports = { MODELS, VAD_FILE, getModel, recommendedFor };
