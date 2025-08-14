import express from 'express';
import ollama from 'ollama';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Load environment variables from .env file
console.log('Loading environment variables...');
const result = dotenv.config();
console.log('Dotenv result:', result);

const app = express();
const port = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const AUTH_REQUIRED = (process.env.AUTH_REQUIRED || 'false').toLowerCase() === 'true';

// Hardcoded user (can be replaced by DB later)
const HARDCODED_USER = {
  username: process.env.DEMO_USERNAME || 'demo',
  name: process.env.DEMO_NAME || 'Demo User',
  passwordHash: bcrypt.hashSync(process.env.DEMO_PASSWORD || 'demo1234', 10),
};

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
  if (req.path.startsWith('/auth/login') || req.path.startsWith('/auth/refresh') || req.path.startsWith('/health')) {
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

// Auth endpoints
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (username !== HARDCODED_USER.username) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const ok = bcrypt.compareSync(password, HARDCODED_USER.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const payload = { username: HARDCODED_USER.username, name: HARDCODED_USER.name };
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

// Endpoint pentru chat cu Ollama
app.post('/chat', async (req, res) => {
    const { message, context } = req.body; // Extragem mesajul și contextul din corpul cererii

    if (!message) {
        return res.status(400).send('Mesajul este necesar în corpul cererii.');
    }

    try {
        // Set headers for Server-Sent Events (SSE)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Use the message as-is since context is already included in the message
        let fullMessage = message;
        console.log('Processing message with embedded context');

        // Folosim stream: true pentru a primi chunk-uri de la Ollama
        const stream = await ollama.chat({
            model: 'llama3.1',
            messages: [{ role: 'user', content: fullMessage }],
            stream: true
        });

        let responseContent = '';
        for await (const chunk of stream) {
            if (chunk.message && chunk.message.content) {
                responseContent += chunk.message.content;
                // Send each chunk as an SSE event
                res.write(`data: ${JSON.stringify({ content: chunk.message.content })}\n\n`);
            }
        }
        // Signal end of stream
        res.write('event: end\ndata: END\n\n');
        res.end();
    } catch (error) {
        console.error('Eroare la comunicarea cu Ollama:', error.message);
        // Send error as SSE event
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
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