# SecureSphere - A Real Time Secure Communication

**A private listening room where friends share one live music timeline.**

SecureSphere includes the **Friends Room**, a real-time networking space built around synchronized YouTube playback, a collaborative queue, room presence, and live chat.

## Features

- **Synchronized playback** — play, pause, seek, and track changes are shared across connected listeners.
- **Collaborative queue** — add tracks to a room-wide queue and let the server advance playback.
- **Team Discussion & Prompt Suggestions** — real-time room discussion with threaded replies, emoji reactions, prompt suggestion tagging, and one-click `Copy Prompt` for admins.
- **Official Shared AI Sessions (ChatGPT, Claude, Gemini)** — enabling an AI platform automatically creates a room-scoped shared AI session with independent per-platform histories. Workspace owners manually run prompts in their own authenticated browser session and publish official prompts & Markdown/code responses (`Admin Prompt` / `Admin-Published AI Response`) to the room; regular members have strictly read-only access.
- **Authenticated Image & Video Sharing** — upload PNG, JPG, WEBP, GIF images and MP4, WEBM, MOV videos via picker, drag-and-drop, or clipboard paste with magic-byte validation, room-scoped authorization, upload progress, lightbox inspection, and on-demand video streaming.
- **Real-Time Multiplayer Whiteboard** — room-scoped interactive vector whiteboard with pen, highlighter, eraser, shapes, arrows, lines, text, sticky notes, image insertion, undo/redo, pan/zoom, live multiplayer cursors, SQLite persistence, and PNG/SVG export.
- **Live room chat** — exchange messages in real time; chat history is stored in SQLite and sent to connecting listeners.
- **Presence and reconnection** — see how many listeners are online and request the latest room state after reconnecting.
- **Private accounts** — authenticate with username and password; an administrator can manage friend accounts.
- **Responsive interface** — dark-first SaaS design with daylight theme option, collapsible sidebar, and mobile slide-out drawer.
- **Admin database exports** — administrators can download account metadata and chat history from SQLite as CSV or PDF.

## Administrator exports

The admin dashboard includes CSV and PDF downloads of the current SQLite account and chat-message records. Both export endpoints require an authenticated administrator, and generated files are marked as non-cacheable. Exports include account IDs, usernames, roles, creation times, and chat message IDs, authors, content, and timestamps. Passwords and password hashes are never exported; passwords are stored as hashes and cannot be recovered.

CSV values are quoted and escaped, and text values that could be interpreted as spreadsheet formulas are prefixed to prevent execution when opened in spreadsheet software. The PDF is a readable report; characters not supported by its built-in font are replaced with question marks. CSV preserves the original message text.

## Networking overview

Each authenticated browser connects to the Node.js room server over Socket.IO. The server maintains the active room timeline and queue, then broadcasts updates to listeners. Playback positions are reconciled against server timestamps so clients can catch up after connecting or returning to the page. Chat messages are persisted in SQLite.

## Listening session workflow

1. Friends sign in with accounts created by the room administrator.
2. A listener starts a YouTube track or adds it to the shared queue.
3. The server broadcasts playback updates and connection presence to the room.
4. Listeners chat while they listen; messages are saved in SQLite and loaded for new connections.
5. Administrators can download the current account and chat records from the admin dashboard without exposing credentials.

```mermaid
flowchart LR
    A[Listener browser] <-->|Socket.IO events| S[SecureSphere server]
    B[Listener browser] <-->|Socket.IO events| S
    S -->|Shared playback and queue state| A
    S -->|Shared playback and queue state| B
    S <-->|Chat history| D[(SQLite)]
```

The live playback state, queue, and room-open timer are held in server memory. The timer starts when the first non-admin listener joins and resets when the last non-admin listener disconnects; admin connections do not start or keep the listening session open. User accounts and chat messages are stored in `data/synctune.db`; use persistent storage for `data/` when deploying to an environment with an ephemeral filesystem.

## Tech stack

- Node.js, Express, and Socket.IO
- SQLite via `better-sqlite3`
- PDF reports via PDFKit
- YouTube IFrame Player API
- HTML and CSS

## Run locally

Requires Node.js 20 or newer.

```powershell
npm install
Copy-Item .env.example .env
```

Before starting the server, edit `.env` and set a unique `JWT_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`. The server creates the administrator account on first startup. Then run:

```powershell
npm start
```

Open `http://localhost:10000`. Sign in with the administrator credentials from `.env` to create friend accounts.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (defaults to `10000`) |
| `JWT_SECRET` | Secret used to sign authentication tokens |
| `ADMIN_USERNAME` | Username for the initial administrator |
| `ADMIN_PASSWORD` | Password for the initial administrator |
| `ROOM_NAME` | Name displayed for the listening room |
| `MAX_IMAGE_UPLOAD_MB` | Maximum allowed image upload size in MB (defaults to `15`) |
| `MAX_VIDEO_UPLOAD_MB` | Maximum allowed video upload size in MB (defaults to `50`) |
| `TLDRAW_LICENSE_KEY` | Optional license key placeholder for custom commercial tldraw deployments |

## Persistent storage & media uploads

- SQLite database (`data/synctune.db`) stores user accounts, rooms, room memberships, discussion messages, reactions, media metadata, shared AI sessions & official AI messages, plugin states, and whiteboard documents.
- Uploaded room images and videos are stored on disk under `data/uploads/<roomId>/` and served exclusively via authenticated, room-authorized endpoints (`GET /api/media/:mediaId`).
- When deploying to Render or another cloud host, attach a persistent disk mounted at `data/` so databases and uploaded media survive redeploys.

## Deploy

The application can run as a Render Web Service:

- **Build command:** `npm install`
- **Start command:** `npm start`
- Configure the environment variables listed above.
- Attach persistent storage for the `data/` directory to retain accounts and chat history across deploys.

SecureSphere uses the official YouTube IFrame Player API. Browser autoplay policies may require each listener to interact with the player before audio can start.
