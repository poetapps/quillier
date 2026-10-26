// The models the smart features can download. GGUF builds from unsloth (Apache-2.0), text weights
// only. Sizes and sha256 are the Hugging Face LFS values for these exact files.
'use strict';

const MODELS = [
  {
    id: 'qwen3.5-0.8b',
    label: '0.8B',
    quant: 'Q8_0',
    file: 'Qwen3.5-0.8B-Q8_0.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q8_0.gguf',
    bytes: 811843840,
    sha256: '0ad885ffd4bb022fc4f0d33a3308fa108ef8613159d3b3a67e23abca056b7a6c',
    // Peak resident memory of the inference process with this model loaded (4096-token context),
    // measured on an M1 Max, rounded up.
    ramGB: 1.7,
    license: 'Apache-2.0',
  },
  {
    id: 'qwen3.5-2b',
    label: '2B',
    quant: 'Q4_K_M',
    file: 'Qwen3.5-2B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf',
    bytes: 1280835840,
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    ramGB: 2.1,
    license: 'Apache-2.0',
  },
  {
    id: 'qwen3.5-4b',
    label: '4B',
    quant: 'Q4_K_M',
    file: 'Qwen3.5-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
    bytes: 2740937888,
    sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
    ramGB: 3.6,
    license: 'Apache-2.0',
  },
];

function getModel(id) {
  return MODELS.find((m) => m.id === id) || null;
}

// Which model to suggest for a machine with this much memory (GB, as os.totalmem()).
// The model has to fit next to the OS, the app and whatever else the writer has open.
// cpuOnly (Intel Macs: node-llama-cpp's mac-x64 build has no GPU support) steps down one size,
// since prompt processing on a CPU is several times slower.
function recommendedFor(totalMemGB, { cpuOnly = false } = {}) {
  const order = ['qwen3.5-0.8b', 'qwen3.5-2b', 'qwen3.5-4b'];
  let i = 2;
  if (!(totalMemGB >= 8)) i = 0;
  else if (totalMemGB < 16) i = 1;
  if (cpuOnly) i = Math.max(0, i - 1);
  return order[i];
}

module.exports = { MODELS, getModel, recommendedFor };
