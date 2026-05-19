import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

dotenv.config();

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR    = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_FILE  = path.join(DATA_DIR, 'users.json');

fs.mkdirSync(DATA_DIR,    { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const JWT_SECRET = process.env.JWT_SECRET     || 'dev-secret-change-in-production';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

// ── User store ────────────────────────────────────────────────────────────────

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── Multer ────────────────────────────────────────────────────────────────────

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ['application/pdf', 'text/plain'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Seuls les fichiers PDF et TXT sont acceptes.'));
  },
});

// ── Auth middleware ───────────────────────────────────────────────────────────

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Non authentifie.' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expiree, reconnecte-toi.' });
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caracteres.' });

  const users = readUsers();
  if (users.find(u => u.email === email.toLowerCase()))
    return res.status(409).json({ error: 'Cet email est deja utilise.' });

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

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, hasCV: false },
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis.' });

  const users = readUsers();
  const user  = users.find(u => u.email === email.toLowerCase().trim());
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, hasCV: !!user.cv },
  });
});

// ── CV routes ─────────────────────────────────────────────────────────────────

app.get('/api/cv', authenticate, (req, res) => {
  const user = readUsers().find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ cv: user.cv || null });
});

app.post('/api/cv/text', authenticate, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Le texte est vide.' });

  const users = readUsers();
  const idx   = users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  users[idx].cv = text.trim();
  writeUsers(users);
  res.json({ cv: users[idx].cv });
});

app.post('/api/cv/upload', authenticate, upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier recu.' });
  const cleanup = () => { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } };

  try {
    let text;
    if (req.file.mimetype === 'application/pdf') {
      const require  = createRequire(import.meta.url);
      const pdfParse = require('pdf-parse');
      const buffer   = fs.readFileSync(req.file.path);
      const parsed   = await pdfParse(buffer);
      text = parsed.text?.trim();
    } else {
      text = fs.readFileSync(req.file.path, 'utf8').trim();
    }
    cleanup();
    if (!text) return res.status(422).json({ error: "Impossible d'extraire le texte du fichier." });

    const users = readUsers();
    const idx   = users.findIndex(u => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    users[idx].cv = text;
    writeUsers(users);
    res.json({ cv: text });
  } catch (err) {
    cleanup();
    res.status(500).json({ error: err.message });
  }
});

// ── OpenAI Realtime — ephemeral token ────────────────────────────────────────

app.post('/api/realtime-token', async (req, res) => {
  const { voice } = req.body;
  if (!OPENAI_KEY)
    return res.status(500).json({ error: 'OPENAI_API_KEY non configuree.' });

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: voice || 'alloy',
      }),
    });
    if (!response.ok)
      return res.status(response.status).json({ error: await response.text() });
    res.json(await response.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Feedback — GPT-4o ─────────────────────────────────────────────────────────

app.post('/api/feedback', async (req, res) => {
  const { config, fullTranscript } = req.body;
  if (!OPENAI_KEY)
    return res.status(500).json({ error: 'OPENAI_API_KEY non configuree.' });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Tu es un coach en recrutement tech. Analyse cette transcription d'entretien et genere un feedback JSON structure.
Format attendu :
{
  "score_global": <1-10>,
  "resume": "<2 phrases>",
  "points_forts": ["...", "...", "..."],
  "axes_amelioration": ["...", "...", "..."],
  "competences": [
    { "nom": "Maitrise technique", "score": <1-10>, "commentaire": "..." },
    { "nom": "Communication", "score": <1-10>, "commentaire": "..." },
    { "nom": "Resolution de problemes", "score": <1-10>, "commentaire": "..." },
    { "nom": "Culture fit", "score": <1-10>, "commentaire": "..." }
  ],
  "conseil_principal": "..."
}`,
          },
          {
            role: 'user',
            content: `Poste : ${config.role} - Niveau : ${config.level}\n\nTranscription :\n${fullTranscript}`,
          },
        ],
      }),
    });
    if (!response.ok)
      return res.status(response.status).json({ error: await response.text() });
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

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
