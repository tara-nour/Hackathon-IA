# Interview Simulator

Simulateur d'entretien technique vocal propulsé par [Mistral AI](https://mistral.ai).
L'IA joue le rôle d'un interviewer, pose des questions à voix haute, écoute tes réponses et génère un feedback détaillé à la fin.

---

## Stack

| Couche | Techno |
|--------|--------|
| Frontend | React 18 + Vite + Tailwind CSS v3 |
| Backend | Express.js (ESM) + WebSocket (ws) |
| STT | Voxtral Mini Transcribe (Mistral) |
| LLM | Mistral Small (streaming SSE) |
| TTS | Voxtral Mini TTS (streaming PCM) |
| Feedback | Mistral Large |
| Auth | JWT + bcrypt, stockage JSON local |

---

## Prérequis

- Node.js >= 18
- Un compte [Mistral AI](https://console.mistral.ai) avec une clé API

---

## Installation

    git clone https://github.com/tara-nour/Hackathon-IA.git
    cd Hackathon-IA
    npm install

---

## Configuration

Copie le fichier d'exemple et renseigne tes valeurs :

    cp .env.example .env

Ouvre  et complète :

    MISTRAL_API_KEY=ta-clé-mistral
    JWT_SECRET=une-chaine-aléatoire-longue
    PORT=3001

Pour générer un  sécurisé :

    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

---

## Lancer le projet

    npm run dev

Cela démarre en parallèle :
- **Vite** sur http://localhost:5173 (frontend)
- **Express + WebSocket** sur http://localhost:3001 (backend)

Ouvre http://localhost:5173 dans ton navigateur.

---

## Fonctionnement

1. **Inscription / Connexion** — crée un compte (email + mot de passe)
2. **CV** *(optionnel)* — importe un PDF ou colle le texte de ton CV
3. **Configuration** — choisis le poste, le type d'entreprise, le niveau et l'interviewer
4. **Session** — l'interviewer parle en premier, réponds à voix haute
5. **Feedback** — score global, compétences évaluées, points forts et axes d'amélioration

---

## Structure du projet

    interview-simulator/
    ├── server.js                      API Express + WebSocket + pipeline Mistral
    ├── src/
    │   ├── screens/
    │   │   ├── AuthScreen.jsx
    │   │   ├── CVScreen.jsx
    │   │   ├── SetupScreen.jsx
    │   │   ├── SessionScreen.jsx
    │   │   └── FeedbackScreen.jsx
    │   ├── hooks/
    │   │   ├── useRealtimeSession.js  WebSocket, VAD, MediaRecorder, TTS
    │   │   └── useAudioVisualizer.js  AnalyserNode → amplitudes barres
    │   ├── utils/
    │   │   ├── buildSystemPrompt.js   5 phases + prompts par persona
    │   │   ├── parseFeedback.js
    │   │   └── api.js                 fetch sécurisé
    │   └── components/
    │       ├── AppHeader.jsx
    │       └── Icons.jsx
    └── data/                          users.json (créé auto, ignoré par git)
