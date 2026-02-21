const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBEDDING_MODEL = 'nomic-embed-text:v1.5';

async function embed(text: string): Promise<Float32Array> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });

  if (!res.ok) {
    throw new Error(`Ollama embeddings failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return new Float32Array(data.embedding);
}

export async function embedDocument(text: string): Promise<Float32Array> {
  return embed(`search_document: ${text}`);
}

export async function embedDocumentBatch(texts: string[]): Promise<Float32Array[]> {
  const prefixed = texts.map(t => `search_document: ${t}`);
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: prefixed }),
  });

  if (!res.ok) {
    throw new Error(`Ollama batch embed failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.embeddings.map((e: number[]) => new Float32Array(e));
}

export async function embedQuery(text: string): Promise<Float32Array> {
  return embed(`search_query: ${text}`);
}

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(OLLAMA_BASE_URL, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
