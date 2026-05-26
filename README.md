# MemoryOS — One memory layer. Every AI. Everywhere.

> A browser extension that silently captures your conversations across ChatGPT and Claude, building one unified, time-aware, self-cleaning memory layer.

---

## The Problem

Every AI session resets. You tell ChatGPT you prefer Python, you're building a RAG pipeline, you use VS Code — next session, it has no idea. Start over. Every. Single. Time.

Existing tools like Mem0 and Zep work within one app only. No system today works across platforms simultaneously, decays old info intelligently, resolves contradictions automatically, and gives users transparent control.

---

## The Solution

MemoryOS is a Chrome browser extension that:

- **Auto-captures** conversations from ChatGPT and Claude silently — no button needed
- **Injects context** into new conversations automatically — your AI already knows you from message one
- **Decays old memories** — older information automatically loses priority, recent truth always wins
- **Resolves conflicts** — powered by Groq's LLaMA 3, contradictions are detected and the outdated memory is marked automatically
- **Triggers staleness prompts** — when a memory's score drops below 0.3, it asks you if it's still accurate
- **Encrypts everything** — all memories are encrypted at rest using Web Crypto API before storage
- **Multi-user support** — each user has their own isolated memory graph

---

## Features

| Feature | Status |
|---------|--------|
| Auto-capture on ChatGPT | ✅ Working |
| Auto-capture on Claude | ✅ Working |
| Context injection into new conversations | ✅ Working |
| Time-aware decay scoring | ✅ Working |
| Groq-powered conflict resolution | ✅ Working |
| Staleness trigger with Yes/No prompt | ✅ Working |
| Web Crypto API encryption at rest | ✅ Working |
| JWT authentication | ✅ Working |
| Multi-user register/login | ✅ Working |
| Pin and delete memories | ✅ Working |
| Search memories | ✅ Working |
| ChromaDB vector storage | ✅ Working |

---

## Tech Stack

**Extension**
- TypeScript + React 18 + Vite
- Chrome Manifest V3
- Web Crypto API (AES-GCM encryption)

**Backend**
- FastAPI (Python)
- ChromaDB (vector store with semantic embeddings)
- Groq API — LLaMA 3 (conflict resolution)
- python-jose (JWT authentication)
- SQLite (user database)

**Total cost: $0** — every tool is free and open source.

---

## Project Structure

```
MemoryOS/
├── backend/
│   ├── main.py          # FastAPI backend — all API endpoints
│   ├── requirements.txt # Python dependencies
│   ├── seed.py          # Script to seed demo memories
│   └── .env             # Environment variables (create this)
└── extension/
    ├── src/
    │   ├── content.ts       # Auto-capture, context injection, staleness trigger
    │   ├── background.ts    # Service worker — handles API calls
    │   ├── crypto.ts        # Web Crypto API encryption helpers
    │   ├── types.ts         # TypeScript types
    │   └── popup/
    │       ├── App.tsx      # Memory panel UI
    │       ├── main.tsx     # React entry point
    │       └── index.css    # Styles
    ├── public/
    │   └── manifest.json    # Chrome extension manifest
    └── package.json
```

---

## Running Locally

### Prerequisites

- Python 3.12+
- Node.js 18+
- A Groq API key (free at console.groq.com)
- Chrome browser

---

### Step 1 — Set up the backend

```bash
cd backend
```

Create a `.env` file:

```
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CHROMA_DB_PATH=./chroma_data
GROQ_API_KEY=your-groq-api-key-here
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the server:

```bash
python -m uvicorn main:app --reload
```

The backend will be running at `http://127.0.0.1:8000`. You can view all endpoints at `http://127.0.0.1:8000/docs`.

---

### Step 2 — Build the Chrome extension

```bash
cd extension
npm install
npm run build
```

---

### Step 3 — Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/dist` folder

The MemoryOS brain icon will appear in your Chrome toolbar.

---

### Step 4 — Create an account and start using it

1. Click the MemoryOS extension icon
2. Click **Create account** and register
3. Open ChatGPT or Claude and start a conversation
4. Memories will be captured automatically
5. Open a **new** ChatGPT or Claude conversation — your context will be injected automatically

---

### Step 5 — Seed demo memories (optional)

To populate the memory panel with realistic demo data:

```bash
cd backend
python seed.py
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Create a new user account |
| POST | `/login` | Login and get JWT token |
| GET | `/memories` | Get all memories for current user |
| POST | `/memories` | Save a new memory |
| DELETE | `/memories/{id}` | Delete a memory |
| PATCH | `/memories/{id}/pin` | Toggle pin on a memory |

---

## How It Works

```
User opens ChatGPT/Claude
        ↓
content.ts detects new AI platform
        ↓
MutationObserver watches for assistant messages
        ↓
New message detected → wait 3s → capture text
        ↓
background.ts encrypts text using Web Crypto API
        ↓
POST /memories → FastAPI backend
        ↓
Groq LLaMA 3 checks for contradictions with existing memories
        ↓
If conflict found → old memory decay_score set to 0
        ↓
Memory stored in ChromaDB as vector embedding
        ↓
Popup panel shows memories sorted by decay score
```

---

## Team

- **Trayee Saha**
- **Ritwika Santra**

---

## License

MIT — free to use, modify, and distribute.
