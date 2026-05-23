# Deployment Topology

Whisper is a client/server app.

## One Computer Demo

This is the current default development setup:

- Backend: `http://127.0.0.1:8000`
- Desktop client: same computer
- Signal bridge: `http://127.0.0.1:8765`
- SQLite database: local backend file

Only the client on this computer can use `127.0.0.1` to reach that backend.

## Two Computers Chatting

Two users can chat only when both desktop clients connect to the same backend server.

Example LAN setup:

- Computer A runs backend on `192.168.1.10:8000`.
- Computer A runs desktop client with:
  - `VITE_API_BASE_URL=http://192.168.1.10:8000`
  - `VITE_WS_BASE_URL=ws://192.168.1.10:8000`
- Computer B runs desktop client with the same backend values:
  - `VITE_API_BASE_URL=http://192.168.1.10:8000`
  - `VITE_WS_BASE_URL=ws://192.168.1.10:8000`
- Each computer runs its own local Signal bridge:
  - `VITE_SIGNAL_RUNTIME_URL=http://127.0.0.1:8765`

The Signal bridge is local per client because it holds private account/session state. The backend is shared because it handles accounts, contacts, message relay, WebSocket delivery, and public E2EE pre-key bundles.

## What Not To Do

Do not let each user run a separate backend on `127.0.0.1` and expect them to communicate. In that setup, Alice and Bob are registering in different databases and connecting to different WebSocket managers, so they cannot see each other.

## Server Notes

For LAN testing, start the backend on a reachable interface:

```powershell
cd E:\Code\python\whisper\whisper_server\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Set CORS for the desktop dev origin if needed:

```env
CORS_ORIGINS=http://localhost:1420,http://127.0.0.1:1420
```

For internet deployment, use a real domain, HTTPS/WSS, a production `SECRET_KEY`, and a managed database instead of local SQLite.
