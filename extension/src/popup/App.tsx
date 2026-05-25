import { useState, useEffect } from 'react';
import { 
  Brain, 
  Trash2, 
  Pin, 
  Search, 
  LogOut, 
  RefreshCw, 
  Lock, 
  User, 
  AlertCircle, 
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Memory } from '../types';
import { decryptText, deriveKey } from '../crypto';

const API_BASE_URL = "http://127.0.0.1:8000";

export default function App() {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // App state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | null>(null);

  // Check auth on mount
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["token"], (result) => {
        if (result.token) {
          setToken(result.token);
          setIsLoggedIn(true);
          fetchMemories(result.token);
        }
      });
    } else {
      // Development mock behavior
      const mockToken = localStorage.getItem("token");
      if (mockToken) {
        setToken(mockToken);
        setIsLoggedIn(true);
        fetchMemories(mockToken);
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setAuthError("Please fill in all fields.");
      return;
    }

    setAuthError("");
    setIsLoggingIn(true);

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Authentication failed");
      }

      const data = await response.json();
      const userToken = data.access_token;
      
      setToken(userToken);
      setIsLoggedIn(true);
      
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ token: userToken });
      } else {
        localStorage.setItem("token", userToken);
      }
      
      fetchMemories(userToken);
    } catch (err: any) {
      setAuthError(err.message || "Could not connect to the API server.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken("");
    setIsLoggedIn(false);
    setMemories([]);
    setUsername("");
    setPassword("");
    setAuthError("");
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(["token"]);
    } else {
      localStorage.removeItem("token");
    }
  };

  const fetchMemories = async (authToken = token) => {
    if (!authToken) return;
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/memories`, {
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch memories (${response.status})`);
      }

      const data = await response.json();
      const key = await deriveKey(authToken);
      const decrypted = await Promise.all(
        (data as Memory[]).map(async (m) => {
          try {
            const text = await decryptText(m.text, key);
            return { ...m, text };
          } catch {
            return m;
          }
        })
      );
      setMemories(decrypted);
    } catch (err: any) {
      setError(err.message || "Failed to sync memories from server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/memories/${id}/pin`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to update pin state");
      }

      const updatedMemory = await response.json();
      
      // Update memory in local state and re-sort
      setMemories(prev => {
        const next = prev.map(m => m.id === id ? updatedMemory : m);
        return [...next].sort((a, b) => b.decay_score - a.decay_score);
      });
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this memory?")) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/memories/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to delete memory");
      }

      setMemories(prev => prev.filter(m => m.id !== id));
      if (expandedMemoryId === id) setExpandedMemoryId(null);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Helpers
  const formatTimeAgo = (timestampStr: string): string => {
    try {
      const date = new Date(timestampStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return "Some time ago";
    }
  };

  const getDecayClass = (score: number): string => {
    if (score >= 0.7) return "decay-fresh";
    if (score >= 0.4) return "decay-medium";
    return "decay-stale";
  };

  // Filter memories
  const filteredMemories = memories.filter(m => 
    m.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.platform.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedCount = memories.filter(m => m.pinned).length;
  const activeCount = memories.length;

  // Render Login view
  if (!isLoggedIn) {
    return (
      <div className="login-screen">
        <div className="bg-glow"></div>
        <div className="logo-container">
          <div className="logo-icon">
            <Brain />
          </div>
          <h1 className="login-title">MemoryOS</h1>
          <p className="login-subtitle">Your AI memory companion</p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="input-group">
            <input 
              type="text" 
              placeholder="Username" 
              className="input-field" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoggingIn}
            />
            <User />
          </div>

          <div className="input-group">
            <input 
              type="password" 
              placeholder="Password" 
              className="input-field" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoggingIn}
            />
            <Lock />
          </div>

          <button type="submit" className="login-btn" disabled={isLoggingIn}>
            {isLoggingIn ? "Authenticating..." : "Sign In"}
          </button>
          
          {authError && (
            <div className="error-banner">
              <AlertCircle style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom', width: '14px', height: '14px' }} />
              {authError}
            </div>
          )}
        </form>
      </div>
    );
  }

  // Render main layout
  return (
    <div className="app-container">
      <div className="bg-glow"></div>
      <div className="bg-glow-bottom"></div>

      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo">
            <Brain />
          </div>
          <h1 className="header-title">MemoryOS</h1>
        </div>
        <div className="header-actions">
          <button 
            className="icon-btn" 
            onClick={() => fetchMemories()} 
            title="Refresh memories"
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
          <button 
            className="icon-btn logout-btn" 
            onClick={handleLogout} 
            title="Log Out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="search-container">
          <input 
            type="text" 
            placeholder="Search memories..." 
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search />
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-label">Total Memories</span>
            <span className="stat-value">{activeCount}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Pinned</span>
            <span className="stat-value">{pinnedCount}</span>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <AlertCircle style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle', width: '14px', height: '14px' }} />
            {error}
          </div>
        )}

        <div className="memory-list">
          {isLoading && memories.length === 0 ? (
            <>
              <div className="skeleton-card"></div>
              <div className="skeleton-card"></div>
              <div className="skeleton-card"></div>
            </>
          ) : filteredMemories.length > 0 ? (
            filteredMemories.map((memory) => {
              const isExpanded = expandedMemoryId === memory.id;
              
              return (
                <div key={memory.id} className={`memory-card ${memory.pinned ? 'pinned' : ''}`}>
                  <div className="memory-card-header">
                    <span className={`platform-badge ${memory.platform.toLowerCase() === 'chatgpt' ? 'chatgpt' : ''}`}>
                      <FileText size={10} />
                      {memory.platform}
                    </span>
                    <span className={`decay-badge ${getDecayClass(memory.decay_score)}`}>
                      Score: {memory.pinned ? "1.00" : memory.decay_score.toFixed(2)}
                    </span>
                  </div>

                  <div 
                    className="memory-body" 
                    onClick={() => setExpandedMemoryId(isExpanded ? null : memory.id)}
                  >
                    <p className={isExpanded ? "memory-text-full" : "memory-text-excerpt"}>
                      {memory.text}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px', color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </div>
                  </div>

                  <div className="memory-footer">
                    <span className="memory-timestamp">
                      {formatTimeAgo(memory.timestamp)}
                    </span>
                    <div className="card-actions">
                      <button 
                        className={`card-action-btn pin-btn ${memory.pinned ? 'pinned' : ''}`}
                        onClick={() => handleTogglePin(memory.id)}
                        title={memory.pinned ? "Unpin memory" : "Pin memory"}
                      >
                        <Pin size={13} fill={memory.pinned ? "currentColor" : "none"} />
                      </button>
                      <button 
                        className="card-action-btn delete-btn"
                        onClick={() => handleDelete(memory.id)}
                        title="Delete memory"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <Brain />
              </div>
              <p className="empty-title">No Memories Yet</p>
              <p className="empty-desc">
                {searchQuery 
                  ? "Try searching for another keyword or term." 
                  : "Open ChatGPT, double check you are logged in, and click the brain button to capture a memory."}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
