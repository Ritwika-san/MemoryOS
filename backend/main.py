
import os
import uuid
import sqlite3
import hashlib
from datetime import datetime, timezone
from typing import List
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel, Field
import chromadb
from dotenv import load_dotenv
from groq import Groq
 
load_dotenv()
 
SECRET_KEY = os.getenv("SECRET_KEY", "9a15f8e5f2066d123b3cf8ad6d0dfebdf5f5e55e4e7e6f3b0638a169fa900f0c")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "demo")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "memoryos")
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_data")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "llama-3.3-70b-versatile"
USERS_DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")
 
os.makedirs(CHROMA_DB_PATH, exist_ok=True)
 
def init_users_db():
    with sqlite3.connect(USERS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
 
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()
 
def get_user(username: str):
    with sqlite3.connect(USERS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT id, username, password, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        return dict(row) if row else None
 
def create_user(username: str, password: str):
    created_at = datetime.now(timezone.utc).isoformat()
    password_hash = hash_password(password)
    with sqlite3.connect(USERS_DB_PATH) as conn:
        conn.execute(
            "INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)",
            (username, password_hash, created_at),
        )
        conn.commit()
 
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc).timestamp() + (ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
 
security = HTTPBearer()
 
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        if not get_user(username):
            raise credentials_exception
        return username
    except JWTError:
        raise credentials_exception
 
chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
collection = chroma_client.get_or_create_collection(name="memories")
 
app = FastAPI(title="MemoryOS API", version="1.0.0")
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
class LoginRequest(BaseModel):
    username: str
    password: str
 
class RegisterRequest(BaseModel):
    username: str
    password: str
 
class TokenResponse(BaseModel):
    access_token: str
    token_type: str
 
class MemoryCreate(BaseModel):
    text: str
    plain_text: str = ""  # unencrypted text for AI processing
    platform: str
    timestamp: str
    decay_score: float = Field(default=1.0, ge=0.0, le=1.0)
 
class MemoryResponse(BaseModel):
    id: str
    text: str
    summary: str
    category: str
    platform: str
    timestamp: str
    decay_score: float
    pinned: bool
 
init_users_db()
if not get_user(ADMIN_USERNAME):
    try:
        create_user(ADMIN_USERNAME, ADMIN_PASSWORD)
    except Exception:
        pass
 
@app.post("/register")
async def register(payload: RegisterRequest):
    if get_user(payload.username):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")
    create_user(payload.username, payload.password)
    return {"status": "success", "message": "User registered successfully"}
 
@app.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    user = get_user(payload.username)
    if not user or user.get("password") != hash_password(payload.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}
 
@app.post("/memories", response_model=MemoryResponse)
async def create_memory(memory: MemoryCreate, username: str = Depends(get_current_user)):
    memory_id = str(uuid.uuid4())
 
    # Parse timestamp
    try:
        datetime.fromisoformat(memory.timestamp.replace("Z", "+00:00"))
        ts = memory.timestamp
    except ValueError:
        ts = datetime.now(timezone.utc).isoformat()
 
    # Use plain_text for AI processing if available, otherwise fall back to encrypted text
    groq_text = memory.plain_text.strip() if memory.plain_text.strip() else memory.text
    print(f"DEBUG plain_text='{memory.plain_text[:80]}'")
    print(f"DEBUG groq_text='{groq_text[:80]}'")

    metadata = {
        "platform": memory.platform,
        "timestamp": ts,
        "decay_score": float(memory.decay_score),
        "pinned": False,
        "owner_id": username,
        "summary": groq_text[:100],  # fallback summary
        "category": "Miscellaneous"  # fallback category
    }
 
    collection.add(
        documents=[memory.text],
        metadatas=[metadata],
        ids=[memory_id]
    )
 
    try:
        if GROQ_API_KEY:
            client = Groq(api_key=GROQ_API_KEY)
 
            # Step 1 — Generate summary and category using plain text
            summary_prompt = (
                f"You are a memory categorization assistant. Categorize based on WHAT THE USER IS DOING, not surface keywords.\n\n"
                f"Categories (with strict definitions):\n"
                f"- Technical: code, tools, frameworks, programming languages, software architecture, debugging, tech stack decisions\n"
                f"- Work: the user's job, freelance work, projects they are building/shipping, career/internship moves, professional plans\n"
                f"- Learning: the user is studying a new skill/subject for general knowledge (NOT tied to a specific project they're building)\n"
                f"- Personal: personality, communication style, how the user likes to be talked to\n"
                f"- Goals: explicit future ambitions, ('I want to become X', 'my goal is Y')\n"
                f"- Lifestyle: food, health, daily habits, hobbies unrelated to work or tech\n"
                f"- Background: biographical facts — where they're from, their education, their story\n"
                f"- Miscellaneous: only if truly nothing else fits\n\n"
                f"Rules:\n"
                f"- If the text is about building/shipping/developing a SPECIFIC project or product, choose Work or Technical — NOT Learning, even if words like 'learning' or 'developing' appear.\n"
                f"- Only choose Learning if the user is acquiring a skill with no specific project tied to it.\n"
                f"- Pick the single best-fitting category. Do not default to Learning.\n\n"
                f"Text: {groq_text}\n\n"
                f"First think silently about what category fits best, then reply in EXACTLY this format with nothing else:\n"
                f"SUMMARY: <one sentence summary>\n"
                f"CATEGORY: <category name>"
            )
            summary_response = client.chat.completions.create(
                model=GROQ_MODEL,
                temperature=0,
                messages=[{"role": "user", "content": summary_prompt}],
            )
            summary_text = (summary_response.choices[0].message.content or "").strip()
 
            # Parse summary and category
            summary = groq_text[:100]  # fallback
            category = "Miscellaneous"  # fallback
            for line in summary_text.split("\n"):
                line = line.strip()
                if line.startswith("SUMMARY:"):
                    summary = line.replace("SUMMARY:", "").strip()
                elif line.startswith("CATEGORY:"):
                    cat = line.replace("CATEGORY:", "").strip()
                    valid_categories = ["Technical", "Work", "Learning", "Personal", "Goals", "Lifestyle", "Background", "Miscellaneous"]
                    if cat in valid_categories:
                        category = cat
 
            # Update metadata with summary and category
            metadata["summary"] = summary
            metadata["category"] = category
            collection.update(ids=[memory_id], metadatas=[metadata])
 
            # Step 2 — Conflict resolution using plain text
            results = collection.get()
            ids = results.get("ids") or []
            docs = results.get("documents") or []
            metas = results.get("metadatas") or []
            existing_pairs = []
            for idx, mid in enumerate(ids):
                if mid == memory_id:
                    continue
                if idx >= len(docs) or idx >= len(metas):
                    continue
                meta = metas[idx] or {}
                owner_id = meta.get("owner_id") if isinstance(meta, dict) else None
                if owner_id is None:
                    if username != ADMIN_USERNAME:
                        continue
                else:
                    if owner_id != username:
                        continue
                # Use summary for conflict detection if available
                existing_summary = meta.get("summary", "") if isinstance(meta, dict) else ""
                existing_text = existing_summary if existing_summary else docs[idx]
                existing_pairs.append(f"{mid}: {existing_text}")
 
            if existing_pairs:
               if existing_pairs:
                conflict_prompt = (
                    f"You are a contradiction-detection assistant. Compare the NEW memory against EXISTING memories.\n\n"
                    f"A contradiction means the new memory states a fact that DIRECTLY REPLACES or CONFLICTS with an old fact "
                    f"(e.g. 'I use VS Code' vs 'I switched to Cursor', 'I live in Mumbai' vs 'I moved to Delhi').\n"
                    f"Do NOT mark it as a contradiction if the new memory is simply a related, additional, or more detailed point — "
                    f"only flag genuine factual conflicts where the old statement is now false.\n\n"
                    f"New memory: {groq_text}\n\n"
                    f"Existing memories with their IDs:\n"
                    + "\n".join(existing_pairs) +
                    "\n\nDoes the new memory contradict exactly one of the existing memories above? "
                    "Reply with ONLY the ID of the contradicted memory, or reply NONE if there is no real contradiction. "
                    "Do not explain your reasoning."
                )
                conflict_response = client.chat.completions.create(
                    model=GROQ_MODEL,
                    temperature=0,
                    messages=[{"role": "user", "content": conflict_prompt}],
                )
                contradicted_id = (conflict_response.choices[0].message.content or "").strip()
                if contradicted_id and contradicted_id.upper() != "NONE":
                    existing = collection.get(ids=[contradicted_id])
                    if existing and existing.get("ids"):
                        existing_meta = (existing.get("metadatas") or [{}])[0] or {}
                        if isinstance(existing_meta, dict):
                            existing_meta = dict(existing_meta)
                            existing_meta["decay_score"] = 0.0
                            collection.update(ids=[contradicted_id], metadatas=[existing_meta])
    except Exception as e:
       print(f"GROQ ERROR: {e}")  # add this
       pass
 
    return MemoryResponse(
        id=memory_id,
        text=memory.text,
        summary=metadata.get("summary", groq_text[:100]),
        category=metadata.get("category", "Miscellaneous"),
        platform=memory.platform,
        timestamp=ts,
        decay_score=memory.decay_score,
        pinned=False
    )
 
def calculate_current_decay(initial_score: float, timestamp_str: str, pinned: bool) -> float:
    if pinned:
        return 1.0
    try:
        cleaned_ts = timestamp_str.replace("Z", "+00:00")
        created_time = datetime.fromisoformat(cleaned_ts)
        now = datetime.now(timezone.utc)
        hours_passed = max(0.0, (now - created_time).total_seconds() / 3600.0)
        return round(max(0.01, initial_score * (0.98 ** hours_passed)), 3)
    except Exception:
        return initial_score
 
@app.get("/memories", response_model=List[MemoryResponse])
async def get_memories(username: str = Depends(get_current_user)):
    results = collection.get()
    if not results or not results['ids']:
        return []
    memories = []
    docs = results.get("documents") or []
    metas = results.get("metadatas") or []
    for idx, mid in enumerate(results['ids']):
        if idx >= len(docs) or idx >= len(metas):
            continue
        doc = docs[idx]
        meta = metas[idx]
        owner_id = meta.get("owner_id") if isinstance(meta, dict) else None
        if owner_id is None:
            if username != ADMIN_USERNAME:
                continue
            if isinstance(meta, dict):
                meta = dict(meta)
                meta["owner_id"] = username
                collection.update(ids=[mid], metadatas=[meta])
        else:
            if owner_id != username:
                continue
        pinned = meta.get("pinned", False)
        current_decay = calculate_current_decay(
            meta.get("decay_score", 1.0),
            meta.get("timestamp", datetime.now(timezone.utc).isoformat()),
            pinned
        )
        memories.append(MemoryResponse(
            id=mid,
            text=doc,
            summary=meta.get("summary", doc[:100] if doc else ""),
            category=meta.get("category", "Miscellaneous"),
            platform=meta.get("platform", "Unknown"),
            timestamp=meta.get("timestamp", ""),
            decay_score=current_decay,
            pinned=pinned
        ))
    memories.sort(key=lambda x: x.decay_score, reverse=True)
    return memories
 
@app.delete("/memories/{id}")
async def delete_memory(id: str, username: str = Depends(get_current_user)):
    existing = collection.get(ids=[id])
    if not existing or not existing['ids']:
        raise HTTPException(status_code=404, detail="Memory not found")
    meta = (existing.get("metadatas") or [{}])[0] or {}
    owner_id = meta.get("owner_id") if isinstance(meta, dict) else None
    if owner_id is None:
        if username != ADMIN_USERNAME:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        if isinstance(meta, dict):
            meta = dict(meta)
            meta["owner_id"] = username
            collection.update(ids=[id], metadatas=[meta])
    else:
        if owner_id != username:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    collection.delete(ids=[id])
    return {"status": "success", "message": f"Memory {id} deleted"}
 
@app.patch("/memories/{id}/pin", response_model=MemoryResponse)
async def toggle_pin_memory(id: str, username: str = Depends(get_current_user)):
    existing = collection.get(ids=[id])
    if not existing or not existing['ids']:
        raise HTTPException(status_code=404, detail="Memory not found")
    doc = existing['documents'][0]
    meta = existing['metadatas'][0]
    owner_id = meta.get("owner_id") if isinstance(meta, dict) else None
    if owner_id is None:
        if username != ADMIN_USERNAME:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        if isinstance(meta, dict):
            meta = dict(meta)
            meta["owner_id"] = username
    else:
        if owner_id != username:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    meta["pinned"] = not meta.get("pinned", False)
    collection.update(ids=[id], metadatas=[meta])
    current_decay = calculate_current_decay(
        meta.get("decay_score", 1.0),
        meta.get("timestamp", ""),
        meta["pinned"]
    )
    return MemoryResponse(
        id=id,
        text=doc,
        summary=meta.get("summary", doc[:100] if doc else ""),
        category=meta.get("category", "Miscellaneous"),
        platform=meta.get("platform", "Unknown"),
        timestamp=meta.get("timestamp", ""),
        decay_score=current_decay,
        pinned=meta["pinned"]
    )
 
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
