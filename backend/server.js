import express from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { moderate } from './utils/moderation.js';
import { rankResults } from './utils/sourceRanker.js';
import { storeMemory, queryMemory } from './utils/memory.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use('/api/', limiter);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';
const BRAVE_API_URL = process.env.BRAVE_API_URL || 'https://api.search.brave.com/res/v1/web/search';

function normalizeBraveResult(item) {
  return {
    title: item.title,
    url: item.url,
    snippet: item.snippet || item.description || '',
    rank: item.rank ?? null,
    source: item.domain || item.source || ''
  };
}

async function callBraveSearch(query, size = 5) {
  if (!BRAVE_API_KEY) throw new Error('BRAVE_API_KEY not configured');
  const q = new URL(BRAVE_API_URL);
  q.searchParams.set('q', query);
  q.searchParams.set('size', String(size));

  const res = await fetch(q.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brave search failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  const hits = data.results || data.items || data.web || data.data || [];
  const list = Array.isArray(hits) ? hits.slice(0, size).map(normalizeBraveResult) : [];
  return { raw: data, results: list };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/search', async (req, res) => {
  const q = req.query.q || req.query.query || '';
  if (!q) return res.status(400).json({ error: 'query required as q' });
  try {
    const out = await callBraveSearch(q, 8);
    out.results = rankResults(out.results);
    res.json(out);
  } catch (e) {
    console.error('Brave search error', e);
    res.status(500).json({ error: String(e) });
  }
});

// Fact verification endpoint
app.post('/api/verify', async (req, res) => {
  const { claim, queries } = req.body;
  if (!claim) return res.status(400).json({ error: 'claim required' });
  try {
    // 1) Generate search queries if not provided
    let searchQueries = queries && queries.length ? queries : [];
    if (searchQueries.length === 0) {
      const gen = await openai.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: `Generate 3 concise web search queries for verifying this claim: "${claim}". Output as JSON array.` });
      const text = gen.output_text || '';
      try { searchQueries = JSON.parse(text); } catch { searchQueries = [claim]; }
    }

    // 2) Run Brave searches and gather snippets
    let allResults = [];
    for (const q of searchQueries.slice(0,5)) {
      try {
        const r = await callBraveSearch(q, 5);
        allResults.push(...r.results);
      } catch (e) { console.warn('search failed for', q, String(e)); }
    }
    allResults = rankResults(allResults).slice(0,8);

    // 3) Ask model to verify based on gathered snippets
    const grounding = allResults.map((r,i)=>`${i+1}. ${r.title} — ${r.url}\n${r.snippet}`).join('\n\n');
    const prompt = `You are a fact-checker. Verify the claim: "${claim}". Use the following snippets as evidence:\n\n${grounding}\n\nRespond with JSON: {"claim":"...","verdict":"true|false|partially true|unverifiable","explanation":"...","sources":[{"title":"...","url":"..."}]}`;
    const resp = await openai.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: prompt });
    const outText = resp.output_text || '';
    let parsed = null;
    try { parsed = JSON.parse(outText); } catch (e) { parsed = { claim, verdict: 'unverifiable', explanation: outText, sources: allResults.slice(0,3) }; }

    res.json({ result: parsed, evidence: allResults });
  } catch (e) {
    console.error('verify error', e);
    res.status(500).json({ error: 'verify failed' });
  }
});

// SSE streaming endpoint with moderation + memory retrieval + Brave grounding
app.get('/api/stream-prompt', async (req, res) => {
  const prompt = req.query.prompt || '';
  const model = req.query.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!prompt || prompt.length < 1) return res.status(400).json({ error: 'Prompt missing' });

  // Moderation check
  try {
    const mod = await moderate(prompt);
    if (!mod.allowed) {
      return res.status(403).json({ error: 'Content blocked by moderation', detail: mod.reason });
    }
  } catch (e) { console.warn('moderation error', e); }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (e) {} };

  try {
    // 1) Retrieve memory hits
    let memoryContext = [];
    try {
      const memHits = await queryMemory(prompt, 4);
      if (memHits && memHits.length) {
        memoryContext = memHits.map(m => `Memory: ${m.text} (score=${m.score.toFixed(3)})`);
        send({ type: 'memory', memories: memoryContext });
      }
    } catch (e) { console.warn('memory lookup failed', e); }

    // 2) Brave search grounding
    let braveContext = { results: [] };
    try {
      braveContext = await callBraveSearch(prompt, 6);
      braveContext.results = rankResults(braveContext.results);
      send({ type: 'search', results: braveContext.results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })) });
    } catch (ee) { console.warn('Brave search failed', ee); send({ type: 'search_error', error: String(ee) }); }

    // 3) Build grounded prompt including memory + top sources
    const groundingTextParts = [];
    if (memoryContext.length) groundingTextParts.push('Relevant memories:\n' + memoryContext.join('\n'));
    if (braveContext.results && braveContext.results.length) groundingTextParts.push('Top web sources:\n' + braveContext.results.map((r,i)=>`${i+1}. ${r.title} — ${r.url}\n${r.snippet}`).join('\n\n'));
    const groundingText = groundingTextParts.join('\n\n');

    const fullInput = `You are Prometheus, an expert assistant. Use the following context (memories + web sources) to ground your answer and cite sources when stating facts. If sources contradict, say so.\n\n${groundingText}\n\nUser question: ${prompt}\nProvide a clear answer and cite sources inline (use [1], [2] referencing the numbered results above).`;

    // 4) Stream LLM response
    const stream = await openai.responses.stream({ model, input: fullInput, stream: true });
    const start = Date.now();
    for await (const event of stream) {
      if (event.type === 'message' || event.type === 'response.output_text.delta') {
        const text = event.delta ?? event.message ?? event.text ?? '';
        if (text) send({ type: 'chunk', text });
      } else if (event.type === 'response.error') {
        send({ type: 'error', error: event });
      } else if (event.type === 'response.completed') {
        const elapsed = Date.now() - start;
        send({ type: 'done', elapsed });
      }
    }

    res.end();
  } catch (err) {
    console.error('Streaming error', err);
    send({ type: 'error', error: String(err) });
    res.end();
  }
});

// Non-streaming prompt endpoint (also stores user queries to memory for future retrieval)
app.post('/api/prompt', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  try {
    const mod = await moderate(prompt);
    if (!mod.allowed) return res.status(403).json({ error: 'Content blocked by moderation', detail: mod.reason });
  } catch (e) { console.warn('moderation failed', e); }

  try {
    // Retrieve memories
    let mems = [];
    try { mems = await queryMemory(prompt, 4); } catch (e) { console.warn('mem query failed', e); }
    let braveContext = { results: [] };
    try { braveContext = await callBraveSearch(prompt, 6); braveContext.results = rankResults(braveContext.results); } catch (ee) { console.warn('brave failed', ee); }

    const groundingTextParts = [];
    if (mems && mems.length) groundingTextParts.push('Relevant memories:\n' + mems.map(m=>m.text).join('\n'));
    if (braveContext.results && braveContext.results.length) groundingTextParts.push('Top web sources:\n' + braveContext.results.map((r,i)=>`${i+1}. ${r.title} — ${r.url}\n${r.snippet}`).join('\n\n'));
    const groundingText = groundingTextParts.join('\n\n');

    const fullInput = `You are Prometheus, an expert assistant. Use the following context to ground your answer and cite sources.\n\n${groundingText}\n\nUser question: ${prompt}`;
    const resp = await openai.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: fullInput });
    const out = resp.output_text || '';
    // store prompt as memory (lightweight)
    try { await storeMemory('user', prompt); } catch (e) { console.warn('store memory failed', e); }
    res.json({ text: out, sources: braveContext.results || [] });
  } catch (e) {
    console.error('prompt error', e);
    res.status(500).json({ error: 'LLM error' });
  }
});

// image endpoint unchanged
app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    const imageResp = await openai.images.generate({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024' });
    const url = imageResp.data?.[0]?.url ?? null;
    res.json({ url, description: `Generated image for: ${prompt}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Image generation failed' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Prometheus backend running on', port));


// Admin endpoints
app.get('/api/admin/memories', async (req,res)=>{
  try {
    const { listMemories } = await import('./utils/memory.js');
    const rows = listMemories(100);
    res.json(rows);
  } catch(e) { console.error('admin error', e); res.status(500).json({error:'admin error'}); }
});


// Tool-calling endpoints
import * as toolRunner from './tools/toolRunner.js';
app.post('/api/tools/calc', toolRunner.calculate);
app.post('/api/tools/fetch', toolRunner.fetchUrl);

// Self-improvement endpoint (on-demand)
import { runSelfImprove } from './self_improve.js';
app.post('/api/self_improve/run', runSelfImprove);

// Multi-model choose helper (expose for debug)
import { chooseModel } from './multimodel.js';
app.get('/api/admin/model-choice', (req,res)=>{ res.json({ model: chooseModel(req.query.task||'') }); });

// Admin analytics endpoint (basic)
app.get('/api/admin/stats', async (req,res)=>{
  try {
    const { listMemories } = await import('./utils/memory.js');
    const mems = listMemories(20);
    res.json({ uptime: process.uptime(), memoryCount: mems.length, sampleMem: mems.slice(0,5) });
  } catch(e){ res.status(500).json({ error: String(e) }); }
});



// Admin login route - issues JWT when correct ADMIN_PASSWORD is provided
import { generateAdminToken } from './utils/auth.js';
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body || {};
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
    if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
    if (!password || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'invalid password' });
    const token = generateAdminToken();
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
