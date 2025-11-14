import Database from 'better-sqlite3';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DB_PATH = process.env.MEM_DB_PATH || 'prometheus_memory.db';
const db = new Database(DB_PATH);

// Initialize table
db.exec(`CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace TEXT,
  text TEXT,
  embedding BLOB,
  created_at INTEGER
);`);

// helper to compute embedding (returns Float32Array as buffer)
export async function embedText(text) {
  const resp = await openai.embeddings.create({ model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small', input: text });
  const emb = resp.data[0].embedding; // array of floats
  // convert to buffer (Float32)
  const buf = new ArrayBuffer(emb.length * 4);
  const view = new Float32Array(buf);
  for (let i=0;i<emb.length;i++) view[i]=emb[i];
  return Buffer.from(buf);
}

export function float32BufferToArray(buf) {
  const view = new Float32Array(buf.buffer || buf);
  return Array.from(view);
}

export async function storeMemory(namespace, text) {
  const embBuf = await embedText(text);
  const stmt = db.prepare('INSERT INTO memories (namespace, text, embedding, created_at) VALUES (?,?,?,?)');
  const info = stmt.run(namespace, text, embBuf, Date.now());
  return info.lastInsertRowid;
}

export function vectorSearch(queryEmbeddingBuf, topK=5) {
  // naive linear scan: decode each embedding and compute cosine similarity
  // For production use a vector DB.
  const rows = db.prepare('SELECT id, namespace, text, embedding, created_at FROM memories').all();
  function toFloatArray(buf) {
    const arr = new Float32Array(buf.buffer || buf);
    return Array.from(arr);
  }
  function cosine(a,b) {
    let dot=0, na=0, nb=0;
    for (let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
    return dot / (Math.sqrt(na)*Math.sqrt(nb)+1e-12);
  }
  const q = toFloatArray(queryEmbeddingBuf);
  const scored = rows.map(r => {
    const emb = toFloatArray(r.embedding);
    return { id: r.id, namespace: r.namespace, text: r.text, score: cosine(q, emb), created_at: r.created_at };
  }).sort((a,b)=>b.score-a.score).slice(0,topK);
  return scored;
}

export async function queryMemory(query, topK=5) {
  const qemb = await embedText(query);
  return vectorSearch(qemb, topK);
}


export function listMemories(limit=50) {
  const rows = db.prepare('SELECT id, namespace, text, created_at FROM memories ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows;
}
