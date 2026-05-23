import os
import uuid
import json
import re
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel, Field
import chromadb
from dotenv import load_dotenv
try:
    from groq import Groq
except Exception:
    Groq = None

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "9a15f8e5f2066d123b3cf8ad6d0dfebdf5f5e55e4e7e6f3b0638a169fa900f0c")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "demo")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "memoryos")
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_data")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "llama3-8b-8192"

os.makedirs(CHROMA_DB_PATH, exist_ok=True)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc).timestamp() + (ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

security = HTTPBearer()

def parse_json_object(text: str) -> Optional[dict]:
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except Exception:
            return None

def mark_contradicted_memory_outdated(new_memory_id: str, new_memory_text: str) -> Optional[str]:
    if not GROQ_API_KEY or Groq is None:
        return None

    results = collection.get()
    ids = results.get("ids") or []
    if not ids:
        return None

    existing = []
    meta_by_id = {}
    docs = results.get("documents") or []
    metas = results.get("metadatas") or []
    for idx, mid in enumerate(ids):
        if mid == new_memory_id:
            continue
        if idx >= len(docs) or idx >= len(metas):
            continue
        doc = docs[idx]
        meta = metas[idx]
        existing.append({"id": mid, "text": doc})
        meta_by_id[mid] = meta

    if not existing:
        return None

    client = Groq(api_key=GROQ_API_KEY)
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You detect whether a NEW memory contradicts any EXISTING memory. "
                    "If a contradiction exists, respond with JSON only: "
                    "{\"contradicted_id\": \"<existing_id>\", \"reason\": \"...\"}. "
                    "If no contradiction, respond with JSON only: "
                    "{\"contradicted_id\": null}."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {"new_memory": new_memory_text, "existing_memories": existing},
                    ensure_ascii=False,
                ),
            },
        ],
    )

    content = response.choices[0].message.content.strip()
    parsed = parse_json_object(content)
    if not parsed:
        return None

    contradicted_id = parsed.get("contradicted_id")
    if not contradicted_id or contradicted_id not in meta_by_id:
        return None

    meta = meta_by_id[contradicted_id] or {}
    if not isinstance(meta, dict):
        return None
    meta = dict(meta)
    meta["decay_score"] = 0.0
    meta["outdated"] = True
    collection.update(ids=[contradicted_id], metadatas=[meta])
    return contradicted_id

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
        if username is None or username != ADMIN_USERNAME:
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

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class MemoryCreate(BaseModel):
    text: str
    platform: str
    timestamp: str
    decay_score: float = Field(default=1.0, ge=0.0, le=1.0)

class MemoryResponse(BaseModel):
    id: str
    text: str
    platform: str
    timestamp: str
    decay_score: float
    pinned: bool

@app.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    if payload.username != ADMIN_USERNAME or payload.password != ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": payload.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/memories", response_model=MemoryResponse)
async def create_memory(memory: MemoryCreate, username: str = Depends(get_current_user)):
    memory_id = str(uuid.uuid4())
    try:
        datetime.fromisoformat(memory.timestamp.replace("Z", "+00:00"))
        ts = memory.timestamp
    except ValueError:
        ts = datetime.now(timezone.utc).isoformat()

    metadata = {
        "platform": memory.platform,
        "timestamp": ts,
        "decay_score": float(memory.decay_score),
        "pinned": False
    }
    collection.add(
        documents=[memory.text],
        metadatas=[metadata],
        ids=[memory_id]
    )
    try:
        mark_contradicted_memory_outdated(memory_id, memory.text)
    except Exception:
        pass
    return MemoryResponse(
        id=memory_id,
        text=memory.text,
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
    for idx, mid in enumerate(results['ids']):
        doc = results['documents'][idx]
        meta = results['metadatas'][idx]
        pinned = meta.get("pinned", False)
        current_decay = calculate_current_decay(
            meta.get("decay_score", 1.0),
            meta.get("timestamp", datetime.now(timezone.utc).isoformat()),
            pinned
        )
        memories.append(MemoryResponse(
            id=mid,
            text=doc,
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
    collection.delete(ids=[id])
    return {"status": "success", "message": f"Memory {id} deleted"}

@app.patch("/memories/{id}/pin", response_model=MemoryResponse)
async def toggle_pin_memory(id: str, username: str = Depends(get_current_user)):
    existing = collection.get(ids=[id])
    if not existing or not existing['ids']:
        raise HTTPException(status_code=404, detail="Memory not found")
    doc = existing['documents'][0]
    meta = existing['metadatas'][0]
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
        platform=meta.get("platform", "Unknown"),
        timestamp=meta.get("timestamp", ""),
        decay_score=current_decay,
        pinned=meta["pinned"]
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
