import express from 'express';
import ollama from 'ollama';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// Load environment variables from .env file
console.log('Loading environment variables...');
const result = dotenv.config();
console.log('Dotenv result:', result);

const app = express();
const port = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const AUTH_REQUIRED = (process.env.AUTH_REQUIRED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE) : null;
const USE_SUPABASE = !!supabase;
const MODEL_NAME = process.env.OLLAMA_MODEL || 'llama3.1';

// Tool: get weather for a city via OSM + Open-Meteo
async function geocodeCity(city) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'vsp-jarvis/1.0 (weather-tool)' } });
  if (!res.ok) throw new Error('Geocoding failed');
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('City not found');
  const { lat, lon, display_name } = arr[0];
  return { latitude: Number(lat), longitude: Number(lon), displayName: display_name };
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const data = await res.json();
  const cw = data.current_weather || data.current || {};
  const temperature = cw.temperature ?? cw.temperature_2m;
  const wind = cw.windspeed ?? cw.wind_speed_10m;
  const time = cw.time || data.time || '';
  return { temperature, wind, time };
}

async function getWeatherForCity(city) {
  const g = await geocodeCity(city);
  const w = await fetchWeather(g.latitude, g.longitude);
  return `Weather for ${g.displayName}: ${w.temperature}°C, wind ${w.wind} km/h (as of ${w.time}).`;
}

const SYSTEM_PROMPT = `You are a helpful assistant.
Priorities:
1) Answer directly when you know the information.
2) Use a tool ONLY when the user requests current/real-time information that you cannot know (e.g., current weather).
3) When a tool result is provided, ground your answer in that data and be concise.`;

// Hardcoded user (can be replaced by DB later)
const HARDCODED_USER = {
  username: process.env.DEMO_USERNAME || 'demo',
  name: process.env.DEMO_NAME || 'Demo User',
  passwordHash: bcrypt.hashSync(process.env.DEMO_PASSWORD || 'demo1234', 10),
};

// Simple file-based users store (used if Supabase not configured)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CONV_DIR = path.join(DATA_DIR, 'conversations');

async function ensureDataDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
}

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// File-based conversations helpers (fallback when Supabase not configured)
async function ensureConvDir() {
  try { await fs.mkdir(CONV_DIR, { recursive: true }); } catch {}
}

function userConvPath(username) {
  return path.join(CONV_DIR, `conv_${username}.json`);
}

async function readUserConvs(username) {
  await ensureConvDir();
  try {
    const raw = await fs.readFile(userConvPath(username), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { conversations: [], replies: {} }; // replies: { [convId]: [{author, content, created_at}] }
  }
}

async function writeUserConvs(username, data) {
  await ensureConvDir();
  await fs.writeFile(userConvPath(username), JSON.stringify(data, null, 2), 'utf-8');
}

// Supabase memory helpers
async function supabaseGetMemory(conversationId) {
  if (!USE_SUPABASE) return null;
  const { data, error } = await supabase
    .from('conversation_memory')
    .select('memory_text')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) throw error;
  return data ? data.memory_text : null;
}

async function supabaseUpsertMemory(conversationId, memoryText) {
  if (!USE_SUPABASE) return null;
  const { error } = await supabase
    .from('conversation_memory')
    .upsert({ conversation_id: conversationId, memory_text: memoryText }, { onConflict: 'conversation_id' });
  if (error) throw error;
}

async function supabaseFindUserByUsername(username) {
  if (!USE_SUPABASE) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, username, name, password_hash')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function supabaseCreateUser({ username, name, passwordHash }) {
  if (!USE_SUPABASE) return null;
  const { data, error } = await supabase
    .from('users')
    .insert([{ username, name, password_hash: passwordHash }])
    .select('id, username, name')
    .single();
  if (error) throw error;
  return data;
}

function createAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

function createRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// Configure Ollama client to connect to VSP server
const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const ollamaApiKey = process.env.OLLAMA_API_KEY;

console.log(`Raw environment variables:`);
console.log(`- process.env.OLLAMA_HOST: "${process.env.OLLAMA_HOST}"`);
console.log(`- process.env.OLLAMA_API_KEY: "${process.env.OLLAMA_API_KEY ? 'EXISTS' : 'NOT FOUND'}"`);

// Set environment variables for ollama client
process.env.OLLAMA_HOST = ollamaHost;
if (ollamaApiKey) {
  process.env.OLLAMA_API_KEY = ollamaApiKey;
}

console.log(`Environment variables loaded:`);
console.log(`- OLLAMA_HOST: ${process.env.OLLAMA_HOST || 'not set'}`);
console.log(`- OLLAMA_API_KEY: ${process.env.OLLAMA_API_KEY ? 'set' : 'not set'}`);
console.log(`Ollama configured to use: ${ollamaHost}`);
if (ollamaApiKey) {
  console.log('API key configured for VSP server');
} else {
  console.log('No API key found - using local Ollama');
}


// Middleware pentru a permite accesul de la alte domenii (CORS) cu cookies
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware pentru a parsa corpul cererilor JSON
app.use(express.json());
app.use(cookieParser());

// Auth middleware (enabled when AUTH_REQUIRED=true)
function authRequired(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  if (
    req.path.startsWith('/auth/login') ||
    req.path.startsWith('/auth/refresh') ||
    req.path.startsWith('/auth/register') ||
    req.path.startsWith('/health')
  ) {
    return next();
  }
  const token = req.cookies?.access_token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

app.use(authRequired);

// Endpoint-ul existent pentru verificare stare
app.get('/health', (req, res) => {
  res.status(200).send('Backend is running!');
});

// Current user info (requires auth)
app.get('/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  return res.json({ ok: true, user: { username: req.user.username, name: req.user.name } });
});

// Conversations API
app.post('/conversations', async (req, res) => {
  try {
    const username = req.user?.username || 'anonymous';
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('conversations')
        .insert([{ username }])
        .select('id, created_at')
        .single();
      if (error) throw error;
      return res.json({ ok: true, conversation: data });
    } else {
      const store = await readUserConvs(username);
      const conv = { id, username, created_at: new Date().toISOString() };
      store.conversations.unshift(conv);
      await writeUserConvs(username, store);
      return res.json({ ok: true, conversation: conv });
    }
  } catch (e) {
    console.error('Create conversation error', e);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.get('/conversations', async (req, res) => {
  try {
    const username = req.user?.username || 'anonymous';
    if (USE_SUPABASE) {
      let data, error;
      // First try with optional title column
      ({ data, error } = await supabase
        .from('conversations')
        .select('id, created_at, title')
        .eq('username', username)
        .order('created_at', { ascending: false }));
      if (error) {
        // Fallback if 'title' column doesn't exist
        ({ data, error } = await supabase
          .from('conversations')
          .select('id, created_at')
          .eq('username', username)
          .order('created_at', { ascending: false }));
        if (error) throw error;
      }
      return res.json({ ok: true, conversations: data });
    } else {
      const store = await readUserConvs(username);
      return res.json({ ok: true, conversations: store.conversations });
    }
  } catch (e) {
    console.error('List conversations error', e);
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
});

app.get('/conversations/:id/replies', async (req, res) => {
  try {
    const username = req.user?.username || 'anonymous';
    const { id } = req.params;
    // ownership check
    if (USE_SUPABASE) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', id)
        .eq('username', username)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    } else {
      const store = await readUserConvs(username);
      const has = (store.conversations || []).some(c => c.id === id);
      if (!has) return res.status(404).json({ error: 'Conversation not found' });
    }
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('conversation_replies')
        .select('author, content, created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.json({ ok: true, replies: data });
    } else {
      const store = await readUserConvs(username);
      const replies = store.replies[id] || [];
      return res.json({ ok: true, replies });
    }
  } catch (e) {
    console.error('Get replies error', e);
    return res.status(500).json({ error: 'Failed to get replies' });
  }
});

// Return conversation memory (summary)
app.get('/conversations/:id/memory', async (req, res) => {
  try {
    const username = req.user?.username || 'anonymous';
    const { id } = req.params;
    // ownership check
    if (USE_SUPABASE) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', id)
        .eq('username', username)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });
      const memory = await supabaseGetMemory(id);
      return res.json({ ok: true, memory: memory || '' });
    } else {
      // file-based memory: embed in a pseudo key under replies store
      const store = await readUserConvs(username);
      const memKey = `__memory_${id}`;
      const memory = store[memKey] || '';
      return res.json({ ok: true, memory });
    }
  } catch (e) {
    console.error('Get memory error', e);
    return res.status(500).json({ error: 'Failed to get memory' });
  }
});

app.post('/conversations/:id/replies', async (req, res) => {
  try {
    const username = req.user?.username || 'anonymous';
    const { id } = req.params;
    const { author, content } = req.body || {};
    if (!author || !content || !['user','assistant'].includes(author)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    // ownership check
    if (USE_SUPABASE) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', id)
        .eq('username', username)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    } else {
      const store = await readUserConvs(username);
      const has = (store.conversations || []).some(c => c.id === id);
      if (!has) return res.status(404).json({ error: 'Conversation not found' });
    }
    if (USE_SUPABASE) {
      const { error } = await supabase
        .from('conversation_replies')
        .insert([{ conversation_id: id, author, content }]);
      if (error) throw error;
      return res.json({ ok: true });
    } else {
      const store = await readUserConvs(username);
      if (!store.replies[id]) store.replies[id] = [];
      store.replies[id].push({ author, content, created_at: new Date().toISOString() });
      await writeUserConvs(username, store);
      return res.json({ ok: true });
    }
  } catch (e) {
    console.error('Append reply error', e);
    return res.status(500).json({ error: 'Failed to append reply' });
  }
});

// Upsert memory text for a conversation
app.post('/conversations/:id/memory', async (req, res) => {
  try {
    const username = req.user?.username || 'anonymous';
    const { id } = req.params;
    const { memory } = req.body || {};
    if (typeof memory !== 'string') return res.status(400).json({ error: 'Invalid memory' });
    // ownership check
    if (USE_SUPABASE) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', id)
        .eq('username', username)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv) return res.status(404).json({ error: 'Conversation not found' });
      await supabaseUpsertMemory(id, memory);
      return res.json({ ok: true });
    } else {
      const store = await readUserConvs(username);
      const memKey = `__memory_${id}`;
      store[memKey] = memory;
      await writeUserConvs(username, store);
      return res.json({ ok: true });
    }
  } catch (e) {
    console.error('Update memory error', e);
    return res.status(500).json({ error: 'Failed to update memory' });
  }
});
// Auth endpoints
app.post('/auth/register', async (req, res) => {
  const { username, name, password } = req.body || {};
  if (!username || !name || !password) {
    return res.status(400).json({ error: 'username, name, password are required' });
  }
  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    let payload;
    if (USE_SUPABASE) {
      const existing = await supabaseFindUserByUsername(username);
      if (existing) return res.status(409).json({ error: 'Username already exists' });
      const created = await supabaseCreateUser({ username, name, passwordHash });
      payload = { username: created.username, name: created.name };
    } else {
      const users = await readUsers();
      if (users.find(u => u.username.toLowerCase() === String(username).toLowerCase())) {
        return res.status(409).json({ error: 'Username already exists' });
      }
      const user = { id: Date.now().toString(), username, name, passwordHash, createdAt: new Date().toISOString() };
      users.push(user);
      await writeUsers(users);
      payload = { username: user.username, name: user.name };
    }
    // Auto-login after registration
    const access = createAccessToken(payload);
    const refresh = createRefreshToken(payload);
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' };
    res.cookie('access_token', access, { ...cookieOpts, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.json({ ok: true, user: payload });
  } catch (e) {
    console.error('Register error', e);
    return res.status(500).json({ error: 'Register failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  // Try Supabase first, then file-based, then hardcoded
  let payload;
  if (USE_SUPABASE) {
    const found = await supabaseFindUserByUsername(username);
    if (!found) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, found.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    payload = { username: found.username, name: found.name };
  } else {
    const users = await readUsers();
    const found = users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
    if (found) {
      const ok = bcrypt.compareSync(password, found.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      payload = { username: found.username, name: found.name };
    } else {
      // Fallback to hardcoded user
      if (username !== HARDCODED_USER.username) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const ok = bcrypt.compareSync(password, HARDCODED_USER.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      payload = { username: HARDCODED_USER.username, name: HARDCODED_USER.name };
    }
  }
  const access = createAccessToken(payload);
  const refresh = createRefreshToken(payload);

  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  };

  res.cookie('access_token', access, { ...cookieOpts, maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
  return res.json({ ok: true, user: payload });
});

app.post('/auth/refresh', (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: 'No refresh token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const access = createAccessToken({ username: payload.username, name: payload.name });
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('access_token', access, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 15 * 60 * 1000,
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

app.post('/auth/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' };
  res.clearCookie('access_token', cookieOpts);
  res.clearCookie('refresh_token', cookieOpts);
  res.json({ ok: true });
});

// Endpoint pentru chat cu Ollama cu logare server-side
app.post('/chat', async (req, res) => {
  const { message, userText, conversationId } = req.body || {};
  if (!message) return res.status(400).send('Mesajul este necesar în corpul cererii.');

  // Ownership check if conversationId provided
  const username = req.user?.username || 'anonymous';
  async function verifyOwnership() {
    if (!conversationId) return true;
    if (USE_SUPABASE) {
      const { data, error } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('username', username)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    } else {
      const store = await readUserConvs(username);
      return (store.conversations || []).some(c => c.id === conversationId);
    }
    }

    try {
        // Set headers for Server-Sent Events (SSE)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

    let ownershipOk = true;
    try { ownershipOk = await verifyOwnership(); } catch (e) { ownershipOk = false; }
    if (conversationId && !ownershipOk) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Unauthorized conversation' })}\n\n`);
      return res.end();
    }

    // Save user message first (best-effort)
    if (conversationId && userText && userText.trim()) {
      try {
        if (USE_SUPABASE) {
          await supabase.from('conversation_replies').insert([{ conversation_id: conversationId, author: 'user', content: userText }]);
          // set title if empty
          try {
            await supabase
              .from('conversations')
              .update({ title: userText.slice(0, 120) })
              .eq('id', conversationId)
              .is('title', null);
          } catch {}
        } else {
          const store = await readUserConvs(username);
          if (!store.replies[conversationId]) store.replies[conversationId] = [];
          store.replies[conversationId].push({ author: 'user', content: userText, created_at: new Date().toISOString() });
          // set title if empty
          const idx = (store.conversations || []).findIndex(c => c.id === conversationId);
          if (idx >= 0 && !store.conversations[idx].title) {
            store.conversations[idx].title = userText.slice(0, 120);
          }
          await writeUserConvs(username, store);
        }
      } catch (e) {
        console.warn('Failed to log user message:', e.message);
      }
    }

    // Prepare tools and messages
    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_weather_for_city',
          description: 'Get the current weather for a city',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string', description: 'City name' } },
            required: ['city']
          }
        }
      }
    ];

    let messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message }
    ];

    let assistantAccum = '';
    // Step 1: non-stream detect tool calls
    try {
      const first = await ollama.chat({ model: MODEL_NAME, messages, tools, stream: false });
      const tc = first.tool_calls || first.message?.tool_calls || [];
      if (Array.isArray(tc) && tc.length > 0) {
        for (const call of tc) {
          const fname = call.function?.name;
          let args = call.function?.arguments;
          if (typeof args === 'string') { try { args = JSON.parse(args); } catch {} }
          args = args || {};
          if (fname === 'get_weather_for_city') {
            const city = args.city || userText || 'Bucharest';
            let result = '';
            try { result = await getWeatherForCity(city); }
            catch (e) { result = `Error: ${e.message}`; }
            messages.push({ role: 'tool', content: result, name: 'get_weather_for_city' });
          }
        }
      }
    } catch (e) {
      console.warn('Tool detect failed:', e.message);
    }

    // Step 2: final streamed answer with any tool results included
    const finalStream = await ollama.chat({ model: MODEL_NAME, messages, tools, stream: true });
    for await (const chunk of finalStream) {
            if (chunk.message && chunk.message.content) {
        assistantAccum += chunk.message.content;
                res.write(`data: ${JSON.stringify({ content: chunk.message.content })}\n\n`);
      }
    }

    // After stream ends, log assistant reply and update memory
    if (conversationId && assistantAccum.trim()) {
      try {
        // Save assistant reply
        if (USE_SUPABASE) {
          await supabase.from('conversation_replies').insert([{ conversation_id: conversationId, author: 'assistant', content: assistantAccum }]);
        } else {
          const store = await readUserConvs(username);
          if (!store.replies[conversationId]) store.replies[conversationId] = [];
          store.replies[conversationId].push({ author: 'assistant', content: assistantAccum, created_at: new Date().toISOString() });
          await writeUserConvs(username, store);
        }

        // Update memory summary
        let currentMemory = '';
        if (USE_SUPABASE) {
          currentMemory = (await supabaseGetMemory(conversationId)) || '';
        } else {
          const store = await readUserConvs(username);
          const memKey = `__memory_${conversationId}`;
          currentMemory = store[memKey] || '';
        }

        const summaryPrompt = `Update the long-term memory below by integrating only durable facts, user preferences, decisions, and commitments from the following user message and assistant answer. Do not include ephemeral chit-chat. Keep it concise but specific. Output the UPDATED MEMORY only, plain text.\n\nPrevious memory:\n${currentMemory}\n\nUser message:\n${userText || ''}\n\nAssistant answer:\n${assistantAccum}`;

        let updatedMemory = '';
        try {
          const memStream = await ollama.chat({ model: 'llama3.1', messages: [{ role: 'user', content: summaryPrompt }], stream: true });
          for await (const m of memStream) {
            if (m.message?.content) updatedMemory += m.message.content;
          }
        } catch (e) {
          console.warn('Memory generation failed:', e.message);
        }

        if (updatedMemory) {
          if (USE_SUPABASE) {
            await supabaseUpsertMemory(conversationId, updatedMemory);
          } else {
            const store = await readUserConvs(username);
            const memKey = `__memory_${conversationId}`;
            store[memKey] = updatedMemory;
            await writeUserConvs(username, store);
          }
        }
      } catch (e) {
        console.warn('Post-stream logging failed:', e.message);
      }
    }

        res.write('event: end\ndata: END\n\n');
        res.end();
    } catch (error) {
        console.error('Eroare la comunicarea cu Ollama:', error.message);
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// Delete a conversation (and cascade)
app.delete('/conversations/:id', async (req, res) => {
  try {
    const username = req.user?.username || 'anonymous';
    const { id } = req.params;
    if (USE_SUPABASE) {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', id)
        .eq('username', username);
      if (error) throw error;
      return res.json({ ok: true });
    } else {
      const store = await readUserConvs(username);
      store.conversations = (store.conversations || []).filter(c => c.id !== id);
      if (store.replies[id]) delete store.replies[id];
      const memKey = `__memory_${id}`;
      if (store[memKey]) delete store[memKey];
      await writeUserConvs(username, store);
      return res.json({ ok: true });
    }
  } catch (e) {
    console.error('Delete conversation error', e);
    return res.status(500).json({ error: 'Failed to delete conversation' });
  }
});



// Wake word detection endpoint
app.post('/wake-word', async (req, res) => {
  try {
    const { audioData } = req.body;
    
    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // For now, return a simple response since we need to set up the model
    // In a real implementation, you would process the audio with Porcupine
    res.json({ 
      detected: false,
      message: 'Wake word detection will be implemented when model is downloaded'
    });
    
  } catch (error) {
    console.error('Wake word error:', error);
    res.status(500).json({ error: error.message });
    }
});

// Pornim serverul Express
app.listen(port, () => {
  console.log(`Serverul Express a pornit pe http://localhost:${port}`);
  console.log('Endpoint-ul /health este disponibil.');
  console.log('Endpoint-ul /chat (POST) este disponibil.');
  console.log('Endpoint-ul /wake-word (POST) este disponibil.');
});