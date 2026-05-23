import requests
from datetime import datetime, timedelta, timezone

BASE_URL = "http://localhost:8000"
USERNAME = "admin"
PASSWORD = "admin123"

def get_auth_token():
    response = requests.post(
        f"{BASE_URL}/login",
        json={"username": USERNAME, "password": PASSWORD}
    )
    response.raise_for_status()
    return response.json()["access_token"]

def create_memory(token, text, platform, timestamp):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "text": text,
        "platform": platform,
        "timestamp": timestamp,
        "decay_score": 1.0
    }
    response = requests.post(
        f"{BASE_URL}/memories",
        json=payload,
        headers=headers
    )
    response.raise_for_status()
    return response.json()

def main():
    print("Logging in...")
    token = get_auth_token()
    print("Login successful!")

    memories = [
        {
            "text": "I prefer Python over JavaScript for backend development",
            "days_ago": 1
        },
        {
            "text": "I am building a RAG pipeline using LangChain",
            "days_ago": 3
        },
        {
            "text": "I use VS Code as my main editor",
            "days_ago": 5
        },
        {
            "text": "I switched from VS Code to Cursor last week",
            "days_ago": 7
        },
        {
            "text": "My project is called MemoryOS and it solves stateless AI memory",
            "days_ago": 7
        }
    ]

    print("\nCreating memories...")
    for memory in memories:
        timestamp = (datetime.now(timezone.utc) - timedelta(days=memory["days_ago"])).isoformat()
        result = create_memory(token, memory["text"], "ChatGPT", timestamp)
        print(f"Created memory: {result['id']}")
        print(f"  Text: {memory['text']}")
        print(f"  Timestamp: {timestamp}")
        print()

    print("All memories created successfully!")

if __name__ == "__main__":
    main()
