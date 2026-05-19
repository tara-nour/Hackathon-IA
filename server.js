import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Shared buildSystemPrompt / PHASES with the frontend
import { PHASES, buildSystemPrompt } from './src/utils/buildSystemPrompt.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';

// ── Helpers ───────────────────────────────────────────────────────────────────

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/**
 * Async queue that bridges event-driven WebSocket messages into a pull-based
 * async iterator, needed for piping audio into the Mistral STT stream.
 */
class AsyncQueue {
  constructor() {
    this._q = [];
    this._resolve = null;
    this._done = false;
  }
  push(item) {
    if (this._resolve) { const r = this._resolve; this._resolve = null; r({ value: item, done: false }); }
    else this._q.push(item);
  }
  end() {
    this._done = true;
    if (this._resolve) { const r = this._resolve; this._resolve = null; r({ value: undefined, done: true }); }
  }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this._q.length) return Promise.resolve({ value: this._q.shift(), done: false });
        if (this._done) return Promise.resolve({ value: undefined, done: true });
        return new Promise(r => { this._resolve = r; });
      },
    };
  }
}

// ── Multer ────────────────────────────────────────────────────────────────────

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ['application/pdf', 'text/plain'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Seuls les fichiers PDF et TXT sont acceptés.'));
  },
});

// ── Auth middleware ───────────────────────────────────────────────────────────

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié.' });
  try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expirée, reconnecte-toi.' }); }
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères.' });

  const users = readUsers();
  if (users.find((u) => u.email === email.toLowerCase()))
    return res.status(409).json({ error: 'Cet email est déjà utilisé.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    cv: null,
  };
  users.push(user);
  writeUsers(users);

  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, hasCV: false } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis.' });

  const users = readUsers();
  const user = users.find((u) => u.email === email.toLowerCase().trim());
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });

  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, hasCV: !!user.cv } });
});

// ── CV routes ─────────────────────────────────────────────────────────────────

app.get('/api/cv', authenticate, (req, res) => {
  const user = readUsers().find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ cv: user.cv || null });
});

app.post('/api/cv/text', authenticate, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Le texte est vide.' });
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  users[idx].cv = text.trim();
  writeUsers(users);
  res.json({ cv: users[idx].cv });
});

app.post('/api/cv/upload', authenticate, upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  const cleanup = () => { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } };
  try {
    let text;
    if (req.file.mimetype === 'application/pdf') {
      const require = createRequire(import.meta.url);
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(req.file.path);
      const parsed = await pdfParse(buffer);
      text = parsed.text?.trim();
    } else {
      text = fs.readFileSync(req.file.path, 'utf8').trim();
    }
    cleanup();
    if (!text) return res.status(422).json({ error: "Impossible d'extraire le texte du fichier." });
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    users[idx].cv = text;
    writeUsers(users);
    res.json({ cv: text });
  } catch (err) {
    cleanup();
    res.status(500).json({ error: err.message });
  }
});

// ── Feedback (Mistral Large) ──────────────────────────────────────────────────

app.post('/api/feedback', async (req, res) => {
  const { config, fullTranscript } = req.body;
  if (!MISTRAL_KEY) return res.status(500).json({ error: 'MISTRAL_API_KEY non configurée.' });

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Tu es un coach en recrutement tech. Analyse cette transcription d'entretien et génère un feedback JSON structuré.
Format attendu :
{
  "score_global": <1-10>,
  "resume": "<2 phrases>",
  "points_forts": ["...", "...", "..."],
  "axes_amelioration": ["...", "...", "..."],
  "competences": [
    { "nom": "Maîtrise technique", "score": <1-10>, "commentaire": "..." },
    { "nom": "Communication", "score": <1-10>, "commentaire": "..." },
    { "nom": "Résolution de problèmes", "score": <1-10>, "commentaire": "..." },
    { "nom": "Culture fit", "score": <1-10>, "commentaire": "..." }
  ],
  "conseil_principal": "..."
}`,
          },
          {
            role: 'user',
            content: `Poste : ${config.role} — Niveau : ${config.level}\n\nTranscription :\n${fullTranscript}`,
          },
        ],
      }),
    });
    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    const data = await response.json();
    res.json(JSON.parse(data.choices[0].message.content));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  res.status(err.status ?? 500).json({ error: err.message || 'Erreur interne.' });
});

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws/session' });

// ── Mistral API helpers ───────────────────────────────────────────────────────

/**
 * Stream Mistral chat completions.
 * Yields text delta strings.
 */
async function* streamChat(messages, model = 'mistral-small-latest') {
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) throw new Error(`Mistral LLM error ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') return;
      try {
        const parsed = JSON.parse(json);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* skip malformed SSE line */ }
    }
  }
}

/**
 * Transcribe a Buffer of audio via Mistral's offline STT endpoint.
 * Returns the transcript text.
 * NOTE: model name — verify at https://docs.mistral.ai/capabilities/audio/
 */
async function transcribeAudio(audioBuffer) {
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
  formData.append('model', 'voxtral-mini-transcribe-2503');
  formData.append('language', 'fr');

  const res = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MISTRAL_KEY}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Mistral STT error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.text || '').trim();
}

/**
 * Stream TTS audio from Mistral Voxtral TTS.
 * Yields Uint8Array PCM chunks.
 * NOTE: model name and response_format — verify at https://docs.mistral.ai/capabilities/audio/text_to_speech/
 */
async function* streamTTS(text) {
  const res = await fetch('https://api.mistral.ai/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'voxtral-mini-tts-2603',
      input: text,
      response_format: 'pcm',
      sampling_rate: 22050,
    }),
  });
  if (!res.ok) throw new Error(`Mistral TTS error ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
}

// ── WebSocket session handler ─────────────────────────────────────────────────

wss.on('connection', (ws) => {
  let config = null;
  let phaseIndex = 0;
  let conversationHistory = []; // for LLM context
  const historyForExport = [];  // {role, text} for UI + feedback
  let fullTranscript = '';
  let isAISpeaking = false;

  // Per-turn audio queue (bridges WS binary messages → async iterator)
  let audioQueue = null;

  function sendJSON(data) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }
  function sendBinary(buf) {
    if (ws.readyState === WebSocket.OPEN) ws.send(buf);
  }

  // ── Message router ────────────────────────────────────────────────────────

  ws.on('message', async (data, isBinary) => {
    if (isBinary) {
      // Binary = audio blob sent by client after VAD silence
      if (!isAISpeaking) handleAudioTurn(data);
    } else {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'config') {
          config = msg.data;
          // Kick off the interview with the first AI turn (no user input yet)
          runAITurn(null);
        } else if (msg.type === 'end_session') {
          ws.close();
        }
      } catch { /* ignore malformed JSON */ }
    }
  });

  // ── Audio turn (STT → check → proceed) ───────────────────────────────────

  async function handleAudioTurn(audioBuffer) {
    if (!config) return;
    sendJSON({ type: 'transcript_processing' });

    try {
      const text = await transcribeAudio(audioBuffer);
      if (!text || text.length < 3) {
        // Noise / empty — just restart listening
        sendJSON({ type: 'transcript_clear' });
        sendJSON({ type: 'listening_start' });
        return;
      }
      sendJSON({ type: 'transcript_final', text });
      await runAITurn(text);
    } catch (err) {
      console.error('[STT]', err.message);
      sendJSON({ type: 'error', message: `Erreur de transcription : ${err.message}` });
      sendJSON({ type: 'listening_start' });
    }
  }

  // ── AI turn (LLM → TTS) ───────────────────────────────────────────────────

  async function runAITurn(userText) {
    if (!config) return;
    isAISpeaking = true;

    // Record user turn
    if (userText) {
      conversationHistory.push({ role: 'user', content: userText });
      historyForExport.push({ role: 'candidat', text: userText });
      fullTranscript += `Candidat : ${userText}\n\n`;
      sendJSON({ type: 'history_add', entry: { role: 'candidat', text: userText } });
    }

    sendJSON({ type: 'ai_speaking_start' });
    sendJSON({ type: 'transcript_clear' });

    // Build LLM messages
    const systemPrompt = buildSystemPrompt(config, PHASES[phaseIndex]);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
    ];

    // Stream LLM response
    let aiText = '';
    try {
      for await (const delta of streamChat(messages)) {
        aiText += delta;
        sendJSON({ type: 'ai_transcript_delta', text: delta });
      }
    } catch (err) {
      console.error('[LLM]', err.message);
      sendJSON({ type: 'error', message: `Erreur LLM : ${err.message}` });
      isAISpeaking = false;
      return;
    }

    // Phase transition detection
    const phaseComplete = aiText.includes('[PHASE_COMPLETE]');
    const cleanText = aiText.replace('[PHASE_COMPLETE]', '').trim();

    if (phaseComplete && phaseIndex < PHASES.length - 1) {
      phaseIndex++;
      sendJSON({ type: 'phase_change', index: phaseIndex, label: PHASES[phaseIndex].label });
    }

    // Record AI turn
    conversationHistory.push({ role: 'assistant', content: cleanText });
    historyForExport.push({ role: 'interviewer', text: cleanText });
    fullTranscript += `Interviewer : ${cleanText}\n\n`;
    sendJSON({ type: 'history_add', entry: { role: 'interviewer', text: cleanText } });

    // Stream TTS audio to client
    try {
      sendJSON({ type: 'tts_start', sampleRate: 22050 });
      for await (const chunk of streamTTS(cleanText)) {
        sendBinary(chunk);
      }
      sendJSON({ type: 'tts_done' });
    } catch (err) {
      console.error('[TTS]', err.message);
      // TTS failed — still continue the session (no audio, but text is shown)
      sendJSON({ type: 'tts_done' });
    }

    sendJSON({ type: 'ai_speaking_end' });
    isAISpeaking = false;

    // If last phase just ended, close the session
    if (phaseComplete && phaseIndex >= PHASES.length - 1) {
      sendJSON({ type: 'session_complete', fullTranscript, history: historyForExport });
      return;
    }

    // Ready for next user turn
    sendJSON({ type: 'listening_start' });
  }

  ws.on('close', () => {
    if (audioQueue) audioQueue.end();
  });
  ws.on('error', () => {
    if (audioQueue) audioQueue.end();
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
