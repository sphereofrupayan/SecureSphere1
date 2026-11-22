require("dotenv").config();
const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const PDFDocument = require("pdfkit");
const Database = require("better-sqlite3");
const { Server } = require("socket.io");
const { GoogleGenAI } = require("@google/genai");
const { tttEngine, chessEngine, ludoEngine } = require("./games-engine");

const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString("hex");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "rupayan_admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeThisAdminPassword123!";
const ROOM_NAME = process.env.ROOM_NAME || "Friends Room";
const DEFAULT_ROOM_ID = "MAIN";
const MAX_IMAGE_UPLOAD_MB = Number(process.env.MAX_IMAGE_UPLOAD_MB || 15);
const MAX_VIDEO_UPLOAD_MB = Number(process.env.MAX_VIDEO_UPLOAD_MB || 50);
const MAX_FILE_UPLOAD_MB = Number(process.env.MAX_FILE_UPLOAD_MB || MAX_VIDEO_UPLOAD_MB || 50);
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_PRIMARY_MODEL = String(process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();
const GEMINI_FALLBACK_MODELS = String(
  process.env.GEMINI_FALLBACK_MODELS || "gemini-3.7-flash,gemma-4-31b-it,gemini-3.1-pro-preview"
)
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const geminiClient = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 1000,
  pingTimeout: 5000,
  cors: {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-file-name", "x-mime-type"]
  }
});

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const uploadsDir = path.join(dataDir, "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
const db = new Database(path.join(dataDir, "synctune.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    room_id TEXT NOT NULL DEFAULT 'MAIN',
    reply_to_id TEXT DEFAULT NULL,
    reply_to_username TEXT DEFAULT NULL,
    reply_to_message TEXT DEFAULT NULL
  );
`);

try { db.prepare("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN room_id TEXT NOT NULL DEFAULT 'MAIN'").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN reply_to_id TEXT DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN reply_to_username TEXT DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN reply_to_message TEXT DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN user_id INTEGER DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'discussion'").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN target_platform TEXT DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN media_id TEXT DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN reactions_json TEXT NOT NULL DEFAULT '{}'").run(); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS room_memberships (
    room_id TEXT NOT NULL,
    username TEXT NOT NULL,
    user_id INTEGER DEFAULT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, username)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS room_plugin_states (
    room_id TEXT PRIMARY KEY,
    allow_member_plugin_toggle INTEGER NOT NULL DEFAULT 0,
    active_ai_platform TEXT DEFAULT NULL,
    chatgpt_enabled INTEGER NOT NULL DEFAULT 0,
    claude_enabled INTEGER NOT NULL DEFAULT 0,
    gemini_enabled INTEGER NOT NULL DEFAULT 0,
    youtube_enabled INTEGER NOT NULL DEFAULT 0,
    games_enabled INTEGER NOT NULL DEFAULT 0,
    whiteboard_member_draw INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  );
`);

try { db.prepare("ALTER TABLE room_plugin_states ADD COLUMN games_enabled INTEGER NOT NULL DEFAULT 0").run(); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS game_matches (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    host_username TEXT NOT NULL,
    players_json TEXT NOT NULL DEFAULT '[]',
    spectators_json TEXT NOT NULL DEFAULT '[]',
    options_json TEXT NOT NULL DEFAULT '{}',
    state_json TEXT NOT NULL DEFAULT '{}',
    winner TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS game_invitations (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    from_username TEXT NOT NULL,
    to_username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL,
    created_by_id INTEGER DEFAULT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    role TEXT NOT NULL,
    author_username TEXT NOT NULL,
    author_user_id INTEGER DEFAULT NULL,
    source_suggestion_id TEXT DEFAULT NULL,
    source_suggestion_author TEXT DEFAULT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

try { db.prepare("ALTER TABLE ai_sessions ADD COLUMN external_conversation_id TEXT DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE ai_sessions ADD COLUMN source_mode TEXT NOT NULL DEFAULT 'manual'").run(); } catch {}
try { db.prepare("ALTER TABLE ai_messages ADD COLUMN external_key TEXT DEFAULT NULL").run(); } catch {}
try { db.prepare("ALTER TABLE ai_messages ADD COLUMN is_streaming INTEGER NOT NULL DEFAULT 0").run(); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_ai_messages_ext ON ai_messages (session_id, external_key);"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS media_attachments (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    uploader_username TEXT NOT NULL,
    uploader_user_id INTEGER DEFAULT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    media_kind TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS whiteboard_documents (
    room_id TEXT PRIMARY KEY,
    elements_json TEXT NOT NULL DEFAULT '[]',
    updated_by TEXT DEFAULT NULL,
    updated_at INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_notifications (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    recipient_username TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT 'overview',
    target_id TEXT DEFAULT NULL,
    meta_json TEXT NOT NULL DEFAULT '{}',
    is_read INTEGER NOT NULL DEFAULT 0,
    dedup_key TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS voice_channels (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_sessions_room_platform ON ai_sessions (room_id, platform, status);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_messages (session_id, created_at);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_media_room ON media_attachments (room_id, created_at);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_game_matches_room ON game_matches (room_id, status, updated_at);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_game_invites_room_to ON game_invitations (room_id, to_username, status);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_user_notifications_lookup ON user_notifications (recipient_username, is_read, created_at);`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_dedup ON user_notifications (recipient_username, dedup_key) WHERE dedup_key IS NOT NULL;`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_voice_channels_room ON voice_channels (room_id, is_default DESC, created_at ASC);`);

db.prepare("UPDATE chat_messages SET room_id = 'MAIN' WHERE room_id IS NULL OR room_id = '' OR LOWER(room_id) = 'main'").run();
db.prepare("DELETE FROM chat_messages WHERE message = '[object Object]'").run();
db.prepare("INSERT OR IGNORE INTO rooms (id, name, created_by) VALUES (?, ?, 'System')").run(DEFAULT_ROOM_ID, ROOM_NAME);

const admin = db.prepare("SELECT id FROM users WHERE username = ?").get(ADMIN_USERNAME);
if (!admin) {
  db.prepare("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)").run(
    ADMIN_USERNAME,
    bcrypt.hashSync(ADMIN_PASSWORD, 12)
  );
} else {
  db.prepare("UPDATE users SET is_admin = 1 WHERE username = ?").run(ADMIN_USERNAME);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-file-name, x-mime-type"
    );
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, status: "healthy", uptime: Math.round(process.uptime()) });
});

app.get("/privacy", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SecureSphere Privacy Policy</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0E14; color: #E2E8F0; line-height: 1.65; }
    main { max-width: 760px; margin: 0 auto; padding: 40px 20px 64px; }
    h1 { color: #FFFFFF; font-size: 28px; margin-bottom: 6px; }
    h2 { color: #38BDF8; font-size: 18px; margin-top: 28px; }
    p, li { color: #CBD5E1; font-size: 15px; }
    .meta { color: #94A3B8; font-size: 13px; margin-bottom: 28px; }
    .card { background: #141A26; border: 1px solid rgba(148,163,184,0.18); border-radius: 14px; padding: 20px 24px; margin-top: 20px; }
  </style>
</head>
<body>
  <main>
    <h1>SecureSphere Privacy Policy</h1>
    <div class="meta">Effective Date: November 2026 &middot; Application ID: com.rupayan.securesphere</div>
    <div class="card">
      <p>SecureSphere is a private real-time team communication and collaboration platform (web and Android mobile app). This policy explains what information we collect, how it is used, and how you can manage or delete your data.</p>
      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>Account Information:</strong> Username and a salted bcrypt hash of your password (plaintext passwords are never stored).</li>
        <li><strong>Workspace Content:</strong> Room chat messages, uploaded media files, whiteboard drawings, shared YouTube queue links, and multiplayer game state created inside rooms you join.</li>
        <li><strong>AI Assistant Prompts:</strong> When you invoke Gemini AI, your prompt and relevant room context are sent to the Google Gemini API to generate your response.</li>
      </ul>
      <h2>2. How We Use Information</h2>
      <ul>
        <li>Authenticate your session securely using signed JSON Web Tokens (stored in Android Keystore via Expo SecureStore on mobile).</li>
        <li>Deliver real-time messaging, file sharing, whiteboard collaboration, games, and notifications across your rooms.</li>
        <li>Provide optional AI workspace summaries when requested by you.</li>
      </ul>
      <h2>3. Data Sharing &amp; Advertising</h2>
      <p>SecureSphere does not sell personal data and does not include third-party advertising SDKs. Data is only transmitted to our hosted backend server and, when you actively use the Gemini AI assistant, to Google's Gemini API.</p>
      <h2>4. Data Retention &amp; Deletion</h2>
      <p>Room owners and administrators can clear room chats, whiteboards, and games at any time. To request deletion of your account and associated data, contact the workspace administrator or email <a href="mailto:rupayanchattaraj@gmail.com" style="color:#60A5FA;">rupayanchattaraj@gmail.com</a> with your username.</p>
    </div>
  </main>
</body>
</html>`);
});

const DEFAULT_ANDROID_APK_URL =
  process.env.ANDROID_APK_URL ||
  "https://expo.dev/artifacts/eas/wv4IPZFYGH5Em3_0jjz9GxWdSY5H0--XfojRru7Fjoo.apk";

app.get("/download", (_req, res) => {
  const apkUrl = String(process.env.ANDROID_APK_URL || DEFAULT_ANDROID_APK_URL).trim();
  const isDirectApk = /\.apk(\?|$)/i.test(apkUrl);
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Download SecureSphere for Android</title>
  <link rel="icon" type="image/png" href="/securesphere-icon.png" />
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      background: radial-gradient(circle at 18% 12%, rgba(56,189,248,0.16), transparent 42%),
                  radial-gradient(circle at 82% 80%, rgba(59,130,246,0.14), transparent 46%),
                  #0B0E14;
      color: #F1F5F9;
      min-height: 100vh;
    }
    main { max-width: 860px; margin: 0 auto; padding: 36px 20px 64px; }
    .hero {
      background: rgba(20, 26, 38, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 22px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    }
    .banner { width: 100%; display: block; max-height: 300px; object-fit: cover; border-bottom: 1px solid rgba(148,163,184,0.14); }
    .hero-body { padding: 28px; }
    .brand-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .app-icon { width: 68px; height: 68px; border-radius: 16px; border: 1px solid rgba(96,165,250,0.4); }
    h1 { margin: 0; font-size: 28px; letter-spacing: -0.4px; color: #FFFFFF; }
    .meta { color: #94A3B8; font-size: 13.5px; margin-top: 4px; }
    .pills { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .pill {
      font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 999px;
      background: rgba(56,189,248,0.12); color: #7DD3FC; border: 1px solid rgba(56,189,248,0.28);
    }
    .pill.green { background: rgba(52,211,153,0.12); color: #34D399; border-color: rgba(52,211,153,0.28); }
    .lead { color: #CBD5E1; font-size: 15.5px; line-height: 1.65; margin: 18px 0 24px; }
    .cta-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 14px 24px; border-radius: 14px; font-weight: 700; font-size: 15px;
      text-decoration: none; transition: transform .15s ease, opacity .15s ease;
    }
    .btn:hover { transform: translateY(-1px); opacity: 0.96; }
    .btn-primary {
      background: linear-gradient(135deg, #38BDF8, #2563EB);
      color: #FFFFFF; box-shadow: 0 10px 26px rgba(37,99,235,0.38);
    }
    .btn-secondary {
      background: rgba(30,41,59,0.85); color: #E2E8F0; border: 1px solid rgba(148,163,184,0.28);
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 22px; }
    .card {
      background: rgba(20,26,38,0.82); border: 1px solid rgba(148,163,184,0.16);
      border-radius: 16px; padding: 18px;
    }
    .card h3 { margin: 0 0 6px; font-size: 15.5px; color: #FFFFFF; }
    .card p { margin: 0; font-size: 13.5px; line-height: 1.55; color: #94A3B8; }
    .steps { margin-top: 22px; background: rgba(15,23,42,0.82); border: 1px solid rgba(96,165,250,0.22); border-radius: 16px; padding: 20px 24px; }
    .steps h2 { margin: 0 0 12px; font-size: 17px; color: #38BDF8; }
    .steps ol { margin: 0; padding-left: 20px; color: #CBD5E1; font-size: 14px; line-height: 1.75; }
    footer { margin-top: 28px; text-align: center; font-size: 13px; color: #64748B; }
    footer a { color: #60A5FA; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <img class="banner" src="/securesphere-banner.png" alt="SecureSphere Android App Banner" />
      <div class="hero-body">
        <div class="brand-row">
          <img class="app-icon" src="/securesphere-icon.png" alt="SecureSphere Icon" />
          <div>
            <h1>SecureSphere for Android</h1>
            <div class="meta">Version 1.0.0 &middot; Package <code>com.rupayan.securesphere</code> &middot; Free Direct Install</div>
          </div>
        </div>
        <div class="pills">
          <span class="pill green">&#9679; Live Cloud Sync</span>
          <span class="pill">Android APK</span>
          <span class="pill">Zero Ads &middot; 100% Free</span>
        </div>
        <p class="lead">
          Private rooms for real-time team chat, file sharing, live collaborative whiteboard, multiplayer games (Chess, Ludo, Tic Tac Toe), synchronized YouTube queue, and Gemini AI workspace assistant.
        </p>
        <div class="cta-row">
          <a class="btn btn-primary" href="${apkUrl.replace(/"/g, "&quot;")}" ${isDirectApk ? 'download="SecureSphere.apk"' : 'target="_blank" rel="noopener"'}>
            &#11015; Download Android App (.APK)
          </a>
          <a class="btn btn-secondary" href="/">
            Open Web App
          </a>
        </div>
      </div>
    </section>

    <section class="steps">
      <h2>How to Install on Android (Takes 15 Seconds)</h2>
      <ol>
        <li>Tap <strong>Download Android App (.APK)</strong> above on your Android phone.</li>
        <li>Open the downloaded <code>SecureSphere.apk</code> file from your notifications or Downloads folder.</li>
        <li>If Android prompts <em>"Install unknown apps"</em>, tap <strong>Settings &rarr; Allow from this source</strong> once, then tap <strong>Install</strong>.</li>
        <li>Launch <strong>SecureSphere</strong>, sign in or create a private room, and collaborate in real time across mobile and web.</li>
      </ol>
    </section>

    <section class="grid">
      <div class="card">
        <h3>Private Rooms &amp; Chat</h3>
        <p>Role-based rooms with real-time messaging, replies, reactions, bookmarks, and instant media &amp; PDF sharing.</p>
      </div>
      <div class="card">
        <h3>Live Whiteboard</h3>
        <p>Draw, highlight, add shapes &amp; sticky notes with pinch-to-zoom, synced live with desktop users.</p>
      </div>
      <div class="card">
        <h3>Gemini AI Assistant</h3>
        <p>Summarize room chats, extract action items, and analyze discussions with clean, formatted answers.</p>
      </div>
      <div class="card">
        <h3>Game Lounge &amp; Watch</h3>
        <p>Play live Chess, Ludo, and Tic Tac Toe or watch YouTube together inside your room.</p>
      </div>
    </section>

    <footer>
      SecureSphere &middot; <a href="/privacy">Privacy Policy</a> &middot; <a href="/">Launch Web App</a>
    </footer>
  </main>
</body>
</html>`);
});

/* ── Per-Room In-Memory Runtime State ──────────────────────── */
const roomStates = new Map();

const getRoomByIdStmt = db.prepare("SELECT id, name, created_by, created_at FROM rooms WHERE UPPER(id) = UPPER(?)");
const insertRoomStmt = db.prepare("INSERT INTO rooms (id, name, created_by) VALUES (?, ?, ?)");

const getChatHistoryStmt = db.prepare(`
  SELECT
    m.id,
    m.room_id AS roomId,
    m.user_id AS userId,
    m.username,
    m.message,
    m.message_type AS messageType,
    m.target_platform AS targetPlatform,
    m.media_id AS mediaId,
    m.reactions_json AS reactionsJson,
    m.created_at AS createdAt,
    m.reply_to_id AS replyToId,
    COALESCE(m.reply_to_username, orig.username) AS replyToUsername,
    COALESCE(m.reply_to_message, orig.message) AS replyToMessage,
    ma.original_name AS mediaOriginalName,
    ma.mime_type AS mediaMimeType,
    ma.media_kind AS mediaKind,
    ma.file_size AS mediaFileSize,
    ma.uploader_username AS mediaUploader
  FROM chat_messages m
  LEFT JOIN chat_messages orig ON orig.id = m.reply_to_id
  LEFT JOIN media_attachments ma ON ma.id = m.media_id
  WHERE UPPER(m.room_id) = UPPER(?)
  ORDER BY m.created_at ASC
  LIMIT 250
`);

const getMessageByIdInRoomStmt = db.prepare(`
  SELECT id, username, message, room_id AS roomId, reactions_json AS reactionsJson
  FROM chat_messages
  WHERE id = ? AND UPPER(room_id) = UPPER(?)
`);

const saveChatMessageStmt = db.prepare(`
  INSERT INTO chat_messages (
    id, room_id, user_id, username, message, message_type, target_platform, media_id, reactions_json, created_at,
    reply_to_id, reply_to_username, reply_to_message
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateChatReactionsStmt = db.prepare("UPDATE chat_messages SET reactions_json = ? WHERE id = ? AND UPPER(room_id) = UPPER(?)");
const deleteChatMessageByIdStmt = db.prepare("DELETE FROM chat_messages WHERE id = ? AND UPPER(room_id) = UPPER(?)");
const clearRoomChatStmt = db.prepare("DELETE FROM chat_messages WHERE UPPER(room_id) = UPPER(?)");

const getRoomVoiceChannelsStmt = db.prepare(
  "SELECT id, room_id, name, created_by, is_default, created_at FROM voice_channels WHERE UPPER(room_id) = UPPER(?) ORDER BY is_default DESC, created_at ASC"
);
const getVoiceChannelByIdStmt = db.prepare(
  "SELECT id, room_id, name, created_by, is_default, created_at FROM voice_channels WHERE id = ? AND UPPER(room_id) = UPPER(?)"
);
const getVoiceChannelByNameStmt = db.prepare(
  "SELECT id, room_id, name FROM voice_channels WHERE UPPER(room_id) = UPPER(?) AND LOWER(name) = LOWER(?)"
);
const insertVoiceChannelStmt = db.prepare(
  "INSERT INTO voice_channels (id, room_id, name, created_by, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?)"
);
const deleteVoiceChannelByIdStmt = db.prepare(
  "DELETE FROM voice_channels WHERE id = ? AND UPPER(room_id) = UPPER(?) AND is_default = 0"
);

const upsertRoomMembershipStmt = db.prepare(`
  INSERT INTO room_memberships (room_id, username, user_id, role, joined_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(room_id, username) DO UPDATE SET
    user_id = COALESCE(excluded.user_id, room_memberships.user_id),
    role = excluded.role
`);
const getRoomMembershipStmt = db.prepare(`
  SELECT room_id, username, role FROM room_memberships
  WHERE UPPER(room_id) = UPPER(?) AND LOWER(username) = LOWER(?)
`);

const getRoomPluginStateStmt = db.prepare("SELECT * FROM room_plugin_states WHERE UPPER(room_id) = UPPER(?)");
const upsertRoomPluginStateStmt = db.prepare(`
  INSERT INTO room_plugin_states (
    room_id, allow_member_plugin_toggle, active_ai_platform,
    chatgpt_enabled, claude_enabled, gemini_enabled, youtube_enabled, games_enabled,
    whiteboard_member_draw, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(room_id) DO UPDATE SET
    allow_member_plugin_toggle = excluded.allow_member_plugin_toggle,
    active_ai_platform = excluded.active_ai_platform,
    chatgpt_enabled = excluded.chatgpt_enabled,
    claude_enabled = excluded.claude_enabled,
    gemini_enabled = excluded.gemini_enabled,
    youtube_enabled = excluded.youtube_enabled,
    games_enabled = excluded.games_enabled,
    whiteboard_member_draw = excluded.whiteboard_member_draw,
    updated_at = excluded.updated_at
`);

const updateRoomOwnerStmt = db.prepare("UPDATE rooms SET created_by = ? WHERE UPPER(id) = UPPER(?)");
const clearRoomOwnerMembershipStmt = db.prepare(
  "UPDATE room_memberships SET role = 'member' WHERE UPPER(room_id) = UPPER(?) AND role = 'owner'"
);
const updateUserAdminRoleStmt = db.prepare("UPDATE users SET is_admin = ? WHERE id = ?");
const getUserByIdStmt = db.prepare("SELECT id, username, is_admin FROM users WHERE id = ?");
const getUserByUsernameInsensitiveStmt = db.prepare(
  "SELECT id, username, is_admin FROM users WHERE LOWER(username) = LOWER(?)"
);

const insertGameMatchStmt = db.prepare(`
  INSERT INTO game_matches (
    id, room_id, game_type, status, host_username, players_json, spectators_json,
    options_json, state_json, winner, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const getGameMatchByIdStmt = db.prepare("SELECT * FROM game_matches WHERE id = ? AND UPPER(room_id) = UPPER(?)");
const getRoomGameMatchesStmt = db.prepare(`
  SELECT * FROM game_matches
  WHERE UPPER(room_id) = UPPER(?)
  ORDER BY updated_at DESC
  LIMIT 35
`);
const updateGameMatchStmt = db.prepare(`
  UPDATE game_matches
  SET status = ?, players_json = ?, spectators_json = ?, options_json = ?, state_json = ?, winner = ?, updated_at = ?
  WHERE id = ? AND UPPER(room_id) = UPPER(?)
`);

const insertGameInviteStmt = db.prepare(`
  INSERT INTO game_invitations (
    id, room_id, match_id, game_type, from_username, to_username, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const getGameInviteByIdStmt = db.prepare("SELECT * FROM game_invitations WHERE id = ? AND UPPER(room_id) = UPPER(?)");
const getRoomPendingInvitesStmt = db.prepare(`
  SELECT * FROM game_invitations
  WHERE UPPER(room_id) = UPPER(?) AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 40
`);
const updateGameInviteStatusStmt = db.prepare(
  "UPDATE game_invitations SET status = ?, updated_at = ? WHERE id = ? AND UPPER(room_id) = UPPER(?)"
);

const insertUserNotificationStmt = db.prepare(`
  INSERT OR IGNORE INTO user_notifications (
    id, room_id, recipient_username, type, title, message,
    target_type, target_id, meta_json, is_read, dedup_key, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
`);
const getUserNotificationsStmt = db.prepare(`
  SELECT
    id, room_id AS roomId, recipient_username AS recipientUsername,
    type, title, message, target_type AS targetType, target_id AS targetId,
    meta_json AS metaJson, is_read AS isRead, dedup_key AS dedupKey, created_at AS createdAt
  FROM user_notifications
  WHERE LOWER(recipient_username) = LOWER(?)
  ORDER BY created_at DESC
  LIMIT 50
`);
const countUnreadNotificationsStmt = db.prepare(`
  SELECT COUNT(*) AS cnt FROM user_notifications
  WHERE LOWER(recipient_username) = LOWER(?) AND is_read = 0
`);
const markNotificationReadStmt = db.prepare(`
  UPDATE user_notifications SET is_read = 1
  WHERE id = ? AND LOWER(recipient_username) = LOWER(?)
`);
const markAllNotificationsReadStmt = db.prepare(`
  UPDATE user_notifications SET is_read = 1
  WHERE LOWER(recipient_username) = LOWER(?) AND is_read = 0
`);
const getRoomKnownMembersStmt = db.prepare(`
  SELECT DISTINCT username FROM room_memberships WHERE UPPER(room_id) = UPPER(?)
`);
const getUserAccessibleRoomsStmt = db.prepare(`
  SELECT r.id, r.name, r.created_by, m.role, m.joined_at
  FROM rooms r
  INNER JOIN room_memberships m ON UPPER(m.room_id) = UPPER(r.id)
  WHERE LOWER(m.username) = LOWER(?)
  ORDER BY m.joined_at DESC
  LIMIT 25
`);
const getRoomRecentMediaStmt = db.prepare(`
  SELECT id, original_name, media_kind, uploader_username, file_size, created_at
  FROM media_attachments
  WHERE UPPER(room_id) = UPPER(?)
  ORDER BY created_at DESC
  LIMIT 20
`);
const countTotalUsersStmt = db.prepare("SELECT COUNT(*) AS total FROM users");

const getRoomAiSessionsStmt = db.prepare(`
  SELECT * FROM ai_sessions
  WHERE UPPER(room_id) = UPPER(?) AND status != 'archived'
  ORDER BY updated_at DESC
`);
const getPlatformAiSessionStmt = db.prepare(`
  SELECT * FROM ai_sessions
  WHERE UPPER(room_id) = UPPER(?) AND platform = ? AND status != 'archived'
  ORDER BY created_at DESC LIMIT 1
`);
const insertAiSessionStmt = db.prepare(`
  INSERT INTO ai_sessions (id, room_id, platform, title, status, created_by, created_by_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateAiSessionStatusStmt = db.prepare("UPDATE ai_sessions SET status = ?, updated_at = ? WHERE id = ?");
const updateAiSessionMetaStmt = db.prepare(`
  UPDATE ai_sessions
  SET external_conversation_id = ?, source_mode = ?, title = ?, updated_at = ?
  WHERE id = ?
`);
const archivePlatformSessionsStmt = db.prepare(`
  UPDATE ai_sessions SET status = 'archived', updated_at = ?
  WHERE UPPER(room_id) = UPPER(?) AND platform = ? AND status != 'archived'
`);
const touchAiSessionStmt = db.prepare("UPDATE ai_sessions SET updated_at = ? WHERE id = ?");

const getRoomAiMessagesStmt = db.prepare(`
  SELECT
    m.id, m.session_id AS sessionId, m.room_id AS roomId, m.platform,
    m.role, m.author_username AS authorUsername, m.author_user_id AS authorUserId,
    m.source_suggestion_id AS sourceSuggestionId,
    m.source_suggestion_author AS sourceSuggestionAuthor,
    m.external_key AS externalKey,
    m.is_streaming AS isStreaming,
    m.content, m.created_at AS createdAt, m.updated_at AS updatedAt
  FROM ai_messages m
  INNER JOIN ai_sessions s ON s.id = m.session_id
  WHERE UPPER(m.room_id) = UPPER(?) AND s.status != 'archived'
  ORDER BY m.created_at ASC
`);
const getAiMessageByIdStmt = db.prepare("SELECT * FROM ai_messages WHERE id = ? AND UPPER(room_id) = UPPER(?)");
const getAiSessionMessagesStmt = db.prepare("SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC");
const insertAiMessageStmt = db.prepare(`
  INSERT INTO ai_messages (
    id, session_id, room_id, platform, role, author_username, author_user_id,
    source_suggestion_id, source_suggestion_author, content, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertAiMessageSyncStmt = db.prepare(`
  INSERT INTO ai_messages (
    id, session_id, room_id, platform, role, author_username, author_user_id,
    source_suggestion_id, source_suggestion_author, external_key, is_streaming,
    content, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
`);
const updateAiMessageStmt = db.prepare("UPDATE ai_messages SET content = ?, updated_at = ? WHERE id = ? AND UPPER(room_id) = UPPER(?)");
const updateAiMessageSyncStmt = db.prepare(`
  UPDATE ai_messages
  SET content = ?, external_key = ?, is_streaming = ?, updated_at = ?
  WHERE id = ? AND UPPER(room_id) = UPPER(?)
`);
const deleteAiMessageStmt = db.prepare("DELETE FROM ai_messages WHERE id = ? AND UPPER(room_id) = UPPER(?)");

const insertMediaStmt = db.prepare(`
  INSERT INTO media_attachments (
    id, room_id, uploader_username, uploader_user_id,
    original_name, stored_name, mime_type, media_kind, file_size, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const getMediaByIdStmt = db.prepare("SELECT * FROM media_attachments WHERE id = ?");

const getWhiteboardDocStmt = db.prepare("SELECT * FROM whiteboard_documents WHERE UPPER(room_id) = UPPER(?)");
const upsertWhiteboardDocStmt = db.prepare(`
  INSERT INTO whiteboard_documents (room_id, elements_json, updated_by, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(room_id) DO UPDATE SET
    elements_json = excluded.elements_json,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
`);

const getExportUsers = db.prepare("SELECT id, username, is_admin, created_at FROM users ORDER BY id ASC");
const getExportChatMessages = db.prepare(`
  SELECT id, room_id, username, message, reply_to_id, created_at
  FROM chat_messages
  ORDER BY created_at ASC, id ASC
`);

function normalizeRoomCode(raw) {
  let str = String(raw || "").trim();
  if (!str) return "";
  try {
    if (str.includes("://") || str.startsWith("/?") || str.includes("?room=")) {
      const url = new URL(str, "http://localhost");
      const fromQuery = url.searchParams.get("room");
      if (fromQuery) str = fromQuery.trim();
    }
  } catch {}
  return str.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
}

function generateUniqueRoomId() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 30; attempt++) {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    const candidate = `SS-${suffix}`;
    const existing = getRoomByIdStmt.get(candidate);
    if (!existing) return candidate;
  }
  return `SS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getRoomRuntime(roomId) {
  const normId = normalizeRoomCode(roomId) || DEFAULT_ROOM_ID;
  const dbRoom = getRoomByIdStmt.get(normId);
  const canonicalId = dbRoom ? dbRoom.id : DEFAULT_ROOM_ID;
  const roomName = dbRoom ? dbRoom.name : ROOM_NAME;
  const owner = dbRoom ? dbRoom.created_by : "System";

  if (!roomStates.has(canonicalId)) {
    const savedState = getRoomPluginStateStmt.get(canonicalId);
    const savedWb = getWhiteboardDocStmt.get(canonicalId);
    const wbElements = savedWb ? safeJsonParse(savedWb.elements_json, []) : [];
    roomStates.set(canonicalId, {
      roomId: canonicalId,
      roomName,
      owner,
      allowMemberPluginToggle: savedState ? Boolean(savedState.allow_member_plugin_toggle) : false,
      activeAiPlatform: savedState ? savedState.active_ai_platform || null : null,
      whiteboardMemberDraw: savedState ? Boolean(savedState.whiteboard_member_draw) : true,
      plugins: {
        chatgpt: savedState ? Boolean(savedState.chatgpt_enabled) : false,
        claude: savedState ? Boolean(savedState.claude_enabled) : false,
        gemini: savedState ? Boolean(savedState.gemini_enabled) : false,
        youtube: savedState ? Boolean(savedState.youtube_enabled) : false,
        games: savedState ? Boolean(savedState.games_enabled) : false
      },
      videoId: "",
      playing: false,
      position: 0,
      updatedAt: Date.now(),
      changedBy: "System",
      queue: [],
      roomOpenedAt: null,
      whiteboardElements: Array.isArray(wbElements) ? wbElements : [],
      whiteboardUndoStack: [],
      whiteboardRedoStack: [],
      whiteboardCursors: new Map(),
      recentClientIds: new Map(),
      voiceParticipants: new Map()
    });
  } else {
    const existing = roomStates.get(canonicalId);
    existing.roomName = roomName;
    existing.owner = owner;
  }
  return roomStates.get(canonicalId);
}

function persistRoomPluginState(runtime) {
  upsertRoomPluginStateStmt.run(
    runtime.roomId,
    runtime.allowMemberPluginToggle ? 1 : 0,
    runtime.activeAiPlatform || null,
    runtime.plugins.chatgpt ? 1 : 0,
    runtime.plugins.claude ? 1 : 0,
    runtime.plugins.gemini ? 1 : 0,
    runtime.plugins.youtube ? 1 : 0,
    runtime.plugins.games ? 1 : 0,
    runtime.whiteboardMemberDraw ? 1 : 0,
    Date.now()
  );
}

function persistWhiteboardDocument(roomId, elements, updatedBy) {
  upsertWhiteboardDocStmt.run(
    roomId,
    JSON.stringify(Array.isArray(elements) ? elements : []),
    updatedBy || null,
    Date.now()
  );
}

function isRoomOwnerOrAdmin(runtime, user) {
  if (!user) return false;
  let isDbAdmin = Boolean(user.isAdmin);
  if (user.id) {
    const freshUser = getUserByIdStmt.get(user.id);
    if (!freshUser) return false;
    isDbAdmin = Boolean(freshUser.is_admin);
    user.isAdmin = isDbAdmin;
  }
  if (isDbAdmin) return true;
  if (!runtime?.owner || runtime.owner === "System") return false;
  return String(user.username || "").toLowerCase() === String(runtime.owner).toLowerCase();
}

function recordRoomMembership(roomId, user, explicitRole) {
  if (!roomId || !user?.username) return;
  const runtime = getRoomRuntime(roomId);
  const role = explicitRole || (isRoomOwnerOrAdmin(runtime, user) ? "owner" : "member");
  const existing = getRoomMembershipStmt.get(runtime.roomId, user.username);
  const canonicalUsername = existing ? existing.username : user.username;
  upsertRoomMembershipStmt.run(runtime.roomId, canonicalUsername, user.id || null, role, Date.now());
}

function isUserMemberOfRoom(roomId, user) {
  if (!user || !roomId) return false;
  if (Boolean(user.isAdmin)) return true;
  const runtime = getRoomRuntime(roomId);
  if (isRoomOwnerOrAdmin(runtime, user)) return true;
  if (getRoomMembershipStmt.get(runtime.roomId, user.username)) return true;
  const roomSet = io.sockets.adapter.rooms.get(socketRoomKey(runtime.roomId));
  if (roomSet) {
    for (const sid of roomSet) {
      const s = io.sockets.sockets.get(sid);
      if (s?.user?.username && s.user.username.toLowerCase() === String(user.username).toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

function isDuplicateClientEvent(runtime, clientId) {
  if (!clientId) return false;
  const key = String(clientId).slice(0, 100);
  const now = Date.now();
  for (const [k, ts] of runtime.recentClientIds) {
    if (now - ts > 60000) runtime.recentClientIds.delete(k);
  }
  if (runtime.recentClientIds.has(key)) return true;
  runtime.recentClientIds.set(key, now);
  if (runtime.recentClientIds.size > 500) {
    const oldestKey = runtime.recentClientIds.keys().next().value;
    if (oldestKey) runtime.recentClientIds.delete(oldestKey);
  }
  return false;
}

function socketRoomKey(roomId) {
  return `room:${roomId}`;
}

function listenerRoomKey(roomId) {
  return `listeners:${roomId}`;
}

function currentPosition(runtime) {
  return runtime.playing
    ? runtime.position + (Date.now() - runtime.updatedAt) / 1000
    : runtime.position;
}

function publicState(roomId) {
  const runtime = getRoomRuntime(roomId);
  return {
    roomId: runtime.roomId,
    roomName: runtime.roomName,
    owner: runtime.owner,
    allowMemberPluginToggle: Boolean(runtime.allowMemberPluginToggle),
    activeAiPlatform: runtime.activeAiPlatform || null,
    whiteboardMemberDraw: Boolean(runtime.whiteboardMemberDraw),
    plugins: { ...runtime.plugins },
    videoId: runtime.videoId,
    playing: runtime.playing,
    position: Math.max(0, currentPosition(runtime)),
    changedBy: runtime.changedBy,
    serverTime: Date.now(),
    queue: runtime.queue
  };
}

function emitState(roomId) {
  const runtime = getRoomRuntime(roomId);
  io.to(socketRoomKey(runtime.roomId)).emit("state", publicState(runtime.roomId));
}

function ensureAiSessionForPlatform(roomId, platform, actorUser) {
  const runtime = getRoomRuntime(roomId);
  const meta = AI_PLATFORMS[platform];
  if (!meta) return null;
  const now = Date.now();
  let session = getPlatformAiSessionStmt.get(runtime.roomId, platform);
  if (session) {
    if (session.status !== "active") {
      updateAiSessionStatusStmt.run("active", now, session.id);
      session = { ...session, status: "active", updated_at: now };
    }
    return session;
  }
  const newSession = {
    id: crypto.randomUUID(),
    room_id: runtime.roomId,
    platform,
    title: `${meta.name} Shared Session`,
    status: "active",
    created_by: actorUser?.username || "System",
    created_by_id: actorUser?.id || null,
    created_at: now,
    updated_at: now
  };
  insertAiSessionStmt.run(
    newSession.id,
    newSession.room_id,
    newSession.platform,
    newSession.title,
    newSession.status,
    newSession.created_by,
    newSession.created_by_id,
    newSession.created_at,
    newSession.updated_at
  );
  return newSession;
}

function getRoomAiCollaborationState(roomId) {
  const runtime = getRoomRuntime(roomId);
  const sessionsRows = getRoomAiSessionsStmt.all(runtime.roomId);
  const sessions = {};
  for (const s of sessionsRows) {
    if (!sessions[s.platform]) {
      sessions[s.platform] = {
        id: s.id,
        roomId: s.room_id,
        platform: s.platform,
        title: s.title,
        status: s.status,
        sourceMode: s.source_mode || "manual",
        externalConversationId: s.external_conversation_id || null,
        createdBy: s.created_by,
        createdAt: s.created_at,
        updatedAt: s.updated_at
      };
    }
  }
  const messages = getRoomAiMessagesStmt.all(runtime.roomId).map(m => ({
    ...m,
    isStreaming: Boolean(m.isStreaming)
  }));
  return {
    roomId: runtime.roomId,
    owner: runtime.owner,
    activePlatform: runtime.activeAiPlatform || null,
    plugins: { ...runtime.plugins },
    liveSync: runtime.aiLiveSync ? { chatgpt: { ...runtime.aiLiveSync.chatgpt } } : {},
    sessions,
    messages
  };
}

function emitAiSessionState(roomId) {
  const payload = getRoomAiCollaborationState(roomId);
  io.to(socketRoomKey(payload.roomId)).emit("aiSessionState", payload);
}

function getWhiteboardStatePayload(roomId) {
  const runtime = getRoomRuntime(roomId);
  return {
    roomId: runtime.roomId,
    elements: runtime.whiteboardElements,
    canClear: true,
    memberDrawAllowed: Boolean(runtime.whiteboardMemberDraw),
    cursors: Array.from(runtime.whiteboardCursors.values())
  };
}

function emitWhiteboardState(roomId) {
  const payload = getWhiteboardStatePayload(roomId);
  io.to(socketRoomKey(payload.roomId)).emit("whiteboardState", payload);
}

/* ── Multiplayer Games Lounge Persistence & Broadcast Helpers ─ */
function formatGameMatchRow(row) {
  if (!row) return null;
  const players = safeJsonParse(row.players_json, []);
  const spectators = safeJsonParse(row.spectators_json, []);
  const options = safeJsonParse(row.options_json, {});
  let rawState = safeJsonParse(row.state_json, null);

  if (row.game_type === "chess" && rawState) {
    if (row.status === "active" && rawState.status === "active") {
      chessEngine.reconcileClocks(rawState, Date.now());
      if (rawState.status !== "active") {
        // Persist timeout transition if clock expired while sitting
        updateGameMatchStmt.run(
          "completed",
          JSON.stringify(players),
          JSON.stringify(spectators),
          JSON.stringify(options),
          JSON.stringify(rawState),
          rawState.winner || null,
          Date.now(),
          row.id,
          row.room_id
        );
        row.status = "completed";
        row.winner = rawState.winner || null;
      }
    }
    rawState = chessEngine.sanitizeForClient(rawState);
  }

  return {
    id: row.id,
    roomId: row.room_id,
    gameType: row.game_type,
    status: row.status,
    hostUsername: row.host_username,
    players,
    spectators,
    options,
    state: rawState,
    winner: row.winner || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getRoomGamesStatePayload(roomId) {
  const runtime = getRoomRuntime(roomId);
  const rows = getRoomGameMatchesStmt.all(runtime.roomId);
  const matches = rows
    .filter(r => r.status !== "cancelled")
    .map(formatGameMatchRow)
    .filter(Boolean);
  const invites = getRoomPendingInvitesStmt.all(runtime.roomId).map(inv => ({
    id: inv.id,
    roomId: inv.room_id,
    matchId: inv.match_id,
    gameType: inv.game_type,
    fromUsername: inv.from_username,
    toUsername: inv.to_username,
    status: inv.status,
    createdAt: inv.created_at
  }));

  return {
    roomId: runtime.roomId,
    gamesEnabled: Boolean(runtime.plugins.games),
    owner: runtime.owner,
    matches,
    pendingInvites: invites
  };
}

function emitGamesLobbyState(roomId) {
  const payload = getRoomGamesStatePayload(roomId);
  io.to(socketRoomKey(payload.roomId)).emit("games:lobbyState", payload);
}

function emitMatchUpdated(matchRowOrFormatted) {
  const formatted =
    matchRowOrFormatted && typeof matchRowOrFormatted.players_json === "string"
      ? formatGameMatchRow(matchRowOrFormatted)
      : matchRowOrFormatted;
  if (!formatted) return;
  io.to(socketRoomKey(formatted.roomId)).emit("games:matchUpdated", formatted);
}

function initializeMatchState(gameType, players, options) {
  if (gameType === "tictactoe") {
    return tttEngine.createInitialState(players, options);
  }
  if (gameType === "chess") {
    return chessEngine.createInitialState(players, options);
  }
  if (gameType === "ludo") {
    return ludoEngine.createInitialState(players, options);
  }
  return null;
}

function emitToRoomUser(roomId, targetUsername, eventName, payload) {
  const roomSet = io.sockets.adapter.rooms.get(socketRoomKey(roomId));
  if (!roomSet) return;
  const targetLower = String(targetUsername || "").toLowerCase();
  for (const sid of roomSet) {
    const s = io.sockets.sockets.get(sid);
    if (s?.user?.username && s.user.username.toLowerCase() === targetLower) {
      s.emit(eventName, payload);
    }
  }
}

/* ── Real-Time Persisted Notifications Engine ──────────────── */
function getGameTitleLabel(gameType) {
  return { chess: "Chess", ludo: "Ludo", tictactoe: "Tic Tac Toe" }[String(gameType || "").toLowerCase()] || "Game";
}

function formatNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.roomId,
    recipientUsername: row.recipientUsername,
    type: row.type,
    title: row.title,
    message: row.message,
    targetType: row.targetType || "overview",
    targetId: row.targetId || null,
    meta: safeJsonParse(row.metaJson || "{}", {}),
    isRead: Boolean(row.isRead),
    createdAt: row.createdAt
  };
}

function getUserNotificationsPayload(username) {
  if (!username) return { notifications: [], unreadCount: 0 };
  const rows = getUserNotificationsStmt.all(username).map(formatNotificationRow).filter(Boolean);
  const unreadRow = countUnreadNotificationsStmt.get(username);
  return {
    notifications: rows,
    unreadCount: unreadRow ? Number(unreadRow.cnt) || 0 : 0
  };
}

function emitToUsernameAcrossAllSockets(username, eventName, payload) {
  const targetLower = String(username || "").toLowerCase();
  if (!targetLower) return;
  for (const [, s] of io.sockets.sockets) {
    if (s.user?.username && s.user.username.toLowerCase() === targetLower) {
      s.emit(eventName, payload);
    }
  }
}

function createUserNotification({
  roomId,
  recipientUsername,
  type,
  title,
  message,
  targetType = "overview",
  targetId = null,
  meta = {},
  dedupKey = null
}) {
  const recipient = String(recipientUsername || "").trim();
  if (!recipient) return null;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  try {
    const info = insertUserNotificationStmt.run(
      id,
      String(roomId || DEFAULT_ROOM_ID).toUpperCase(),
      recipient,
      String(type || "system"),
      String(title || "Notification").slice(0, 120),
      String(message || "").slice(0, 400),
      String(targetType || "overview"),
      targetId ? String(targetId) : null,
      JSON.stringify(meta || {}),
      dedupKey ? String(dedupKey).slice(0, 180) : null,
      createdAt
    );
    if (!info.changes) return null;

    const notif = {
      id,
      roomId: String(roomId || DEFAULT_ROOM_ID).toUpperCase(),
      recipientUsername: recipient,
      type,
      title,
      message,
      targetType,
      targetId,
      meta,
      isRead: false,
      createdAt
    };
    const { unreadCount } = getUserNotificationsPayload(recipient);
    emitToUsernameAcrossAllSockets(recipient, "notification:new", {
      notification: notif,
      unreadCount
    });
    return notif;
  } catch (err) {
    console.error("Failed to create notification", err);
    return null;
  }
}

function notifyRoomParticipants(roomId, excludeUsername, builderFn, onlineOnly = false) {
  const runtime = getRoomRuntime(roomId);
  const { members } = getRoomParticipants(runtime.roomId);
  const recipientsMap = new Map();

  members.forEach(m => {
    if (m?.username) recipientsMap.set(m.username.toLowerCase(), m.username);
  });

  if (!onlineOnly) {
    const savedMembers = getRoomKnownMembersStmt.all(runtime.roomId);
    savedMembers.forEach(m => {
      if (m?.username && !recipientsMap.has(m.username.toLowerCase())) {
        recipientsMap.set(m.username.toLowerCase(), m.username);
      }
    });
  }

  const excludeLower = String(excludeUsername || "").toLowerCase();
  for (const [lower, canonicalName] of recipientsMap) {
    if (lower === excludeLower) continue;
    const spec = builderFn(canonicalName);
    if (spec) {
      createUserNotification({
        roomId: runtime.roomId,
        recipientUsername: canonicalName,
        ...spec
      });
    }
  }
}

function notifyGameTurnOrCompletion(match, actorUsername) {
  if (!match || !match.state) return;
  const gameTitle = getGameTitleLabel(match.gameType);
  if (match.status === "completed") {
    const winner = match.winner || match.state.winnerUsername || match.state.winner;
    const msgText =
      winner === "draw"
        ? `${gameTitle} match ended in a draw.`
        : winner
        ? `${winner} won the ${gameTitle} match!`
        : `${gameTitle} match completed.`;
    const endKey = `match_end:${match.id}:${match.updatedAt}`;
    for (const p of match.players || []) {
      createUserNotification({
        roomId: match.roomId,
        recipientUsername: p,
        type: "game_result",
        title: `${gameTitle} Match Result`,
        message: msgText,
        targetType: "games_match",
        targetId: match.id,
        meta: { gameType: match.gameType, winner },
        dedupKey: endKey
      });
    }
    return;
  }

  if (match.status === "active" && match.state.turnUsername) {
    const nextTurn = match.state.turnUsername;
    if (String(nextTurn).toLowerCase() !== String(actorUsername || "").toLowerCase()) {
      const turnSeq =
        match.gameType === "chess"
          ? `chess:${match.state.moveHistory?.length || 0}`
          : match.gameType === "ludo"
          ? `ludo:${match.state.moveSeq || 0}:${match.state.rollId || 0}`
          : `ttt:${match.state.moveCount || 0}`;
      createUserNotification({
        roomId: match.roomId,
        recipientUsername: nextTurn,
        type: "game_turn",
        title: `Your Turn in ${gameTitle}`,
        message: `${actorUsername || "Opponent"} played — it is now your turn in ${gameTitle}.`,
        targetType: "games_match",
        targetId: match.id,
        meta: { gameType: match.gameType },
        dedupKey: `turn:${match.id}:${turnSeq}`
      });
    }
  }
}

function startNext(roomId) {
  const runtime = getRoomRuntime(roomId);
  const next = runtime.queue.shift();
  if (!next) {
    runtime.videoId = "";
    runtime.playing = false;
    runtime.position = 0;
    runtime.updatedAt = Date.now();
    runtime.changedBy = "System";
    emitState(runtime.roomId);
    return;
  }
  runtime.videoId = next.videoId;
  runtime.playing = true;
  runtime.position = 0;
  runtime.updatedAt = Date.now();
  runtime.changedBy = next.addedBy;
  emitState(runtime.roomId);
}

function getRoomParticipants(roomId) {
  const runtime = getRoomRuntime(roomId);
  const roomSet = io.sockets.adapter.rooms.get(socketRoomKey(runtime.roomId));
  if (!roomSet) return { count: 0, participants: [], members: [] };
  const names = new Set();
  const membersMap = new Map();
  for (const socketId of roomSet) {
    const s = io.sockets.sockets.get(socketId);
    if (s?.user?.username) {
      const uname = s.user.username;
      names.add(uname);
      if (!membersMap.has(uname.toLowerCase())) {
        const isOwner =
          runtime.owner === "System"
            ? Boolean(s.user.isAdmin)
            : uname.toLowerCase() === String(runtime.owner || "").toLowerCase();
        membersMap.set(uname.toLowerCase(), {
          username: uname,
          isAdmin: Boolean(s.user.isAdmin),
          isOwner
        });
      }
    }
  }
  return {
    count: roomSet.size,
    participants: Array.from(names),
    members: Array.from(membersMap.values())
  };
}

function emitRoomPresence(roomId) {
  const runtime = getRoomRuntime(roomId);
  const { count, participants, members } = getRoomParticipants(runtime.roomId);
  io.to(socketRoomKey(runtime.roomId)).emit("presence", {
    roomId: runtime.roomId,
    owner: runtime.owner,
    count,
    participants,
    members
  });
}

function emitRoomStatus(roomId) {
  const runtime = getRoomRuntime(roomId);
  io.to(socketRoomKey(runtime.roomId)).emit("roomStatus", {
    roomId: runtime.roomId,
    roomName: runtime.roomName,
    roomOpenedAt: runtime.roomOpenedAt
  });
}

function formatChatMessageRow(row) {
  const replyTo = row.replyToId
    ? {
        id: row.replyToId,
        username: row.replyToUsername || "User",
        message: row.replyToMessage || ""
      }
    : null;
  const reactions =
    typeof row.reactions === "object" && row.reactions !== null
      ? row.reactions
      : safeJsonParse(row.reactionsJson || "{}", {});
  const media =
    row.media && row.media.id
      ? row.media
      : row.mediaId && row.mediaOriginalName
      ? {
          id: row.mediaId,
          originalName: row.mediaOriginalName,
          mimeType: row.mediaMimeType,
          mediaKind: row.mediaKind,
          fileSize: row.mediaFileSize,
          uploaderUsername: row.mediaUploader || row.username,
          url: `/api/media/${encodeURIComponent(row.mediaId)}`
        }
      : null;

  return {
    id: row.id,
    roomId: row.roomId || DEFAULT_ROOM_ID,
    userId: row.userId || null,
    username: row.username,
    message: row.message,
    messageType: row.messageType || "discussion",
    targetPlatform: row.targetPlatform || null,
    mediaId: row.mediaId || null,
    media,
    reactions,
    createdAt: row.createdAt,
    replyToId: row.replyToId || null,
    replyToUsername: replyTo ? replyTo.username : null,
    replyToMessage: replyTo ? replyTo.message : null,
    replyTo
  };
}

function getRoomChatHistory(roomId) {
  return getChatHistoryStmt.all(roomId).map(formatChatMessageRow);
}

function signUser(user) {
  return jwt.sign(
    { id: user.id, username: user.username, isAdmin: Boolean(user.is_admin) },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function setAuthCookie(res, tokenValue) {
  res.cookie("synctune_token", tokenValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

const CODE_FILE_EXTS = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".cc", ".cpp", ".h", ".hpp",
  ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".kts", ".scala", ".sql", ".sh", ".bash",
  ".zsh", ".ps1", ".bat", ".cmd", ".html", ".htm", ".css", ".scss", ".sass", ".less", ".json",
  ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".svg", ".ini", ".env", ".conf", ".vue", ".svelte",
  ".astro", ".prisma", ".graphql", ".gql", ".r", ".lua", ".pl", ".gradle", ".properties"
]);

const DOCUMENT_FILE_EXTS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp",
  ".rtf", ".csv", ".tsv", ".txt", ".md", ".markdown", ".log", ".tex", ".pages", ".numbers", ".key"
]);

const AUDIO_FILE_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus", ".weba"]);

const SAFE_MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".rar": "application/vnd.rar",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
  ".svg": "image/svg+xml"
};

function validateMediaBuffer(buffer, declaredMime, originalName) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { error: "Uploaded file is empty." };
  }
  const mime = String(declaredMime || "").toLowerCase().split(";")[0].trim();
  const extMatch = path.extname(String(originalName || "")).toLowerCase();
  const baseLower = path.basename(String(originalName || "")).toLowerCase();

  // Check bitmap/video magic bytes whenever the upload claims bitmap/video MIME or extension
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isGif =
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a");
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const isWebm =
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3;
  const isIsobmff = buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
  const isQuickTimeBrand =
    isIsobmff && buffer.subarray(8, 12).toString("ascii").toLowerCase() === "qt  ";
  const isPdfHeader = buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";

  const strictBitmapExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
  const strictVideoExts = new Set([".mp4", ".webm", ".mov"]);
  const strictBitmapMimes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
  const strictVideoMimes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

  const claimsStrictMedia =
    strictBitmapExts.has(extMatch) ||
    strictVideoExts.has(extMatch) ||
    strictBitmapMimes.has(mime) ||
    strictVideoMimes.has(mime);

  let verified = null;
  if (isPng && (mime === "image/png" || extMatch === ".png")) {
    verified = { mimeType: "image/png", ext: "png", mediaKind: "image", maxMb: MAX_IMAGE_UPLOAD_MB };
  } else if (isJpeg && (mime === "image/jpeg" || mime === "image/jpg" || extMatch === ".jpg" || extMatch === ".jpeg")) {
    verified = { mimeType: "image/jpeg", ext: "jpg", mediaKind: "image", maxMb: MAX_IMAGE_UPLOAD_MB };
  } else if (isWebp && (mime === "image/webp" || extMatch === ".webp")) {
    verified = { mimeType: "image/webp", ext: "webp", mediaKind: "image", maxMb: MAX_IMAGE_UPLOAD_MB };
  } else if (isGif && (mime === "image/gif" || extMatch === ".gif")) {
    verified = { mimeType: "image/gif", ext: "gif", mediaKind: "image", maxMb: MAX_IMAGE_UPLOAD_MB };
  } else if (isWebm && (mime === "video/webm" || extMatch === ".webm")) {
    verified = { mimeType: "video/webm", ext: "webm", mediaKind: "video", maxMb: MAX_VIDEO_UPLOAD_MB };
  } else if (isIsobmff && (mime === "video/quicktime" || (extMatch === ".mov" && (isQuickTimeBrand || mime === "video/mp4" || !mime)))) {
    verified = { mimeType: "video/quicktime", ext: "mov", mediaKind: "video", maxMb: MAX_VIDEO_UPLOAD_MB };
  } else if (isIsobmff && (mime === "video/mp4" || extMatch === ".mp4")) {
    verified = { mimeType: "video/mp4", ext: "mp4", mediaKind: "video", maxMb: MAX_VIDEO_UPLOAD_MB };
  } else if (claimsStrictMedia) {
    return {
      error: "Invalid image or video signature. The file content does not match the claimed media format."
    };
  } else {
    // Allow documents, PDFs, code files, audio, archives, and general attachments up to MAX_FILE_UPLOAD_MB
    const safeExt = extMatch.replace(/[^.a-z0-9]/g, "").replace(/^\./, "").slice(0, 12) || "bin";
    let mediaKind = "file";
    if (extMatch === ".pdf" || isPdfHeader || mime === "application/pdf") {
      mediaKind = "pdf";
    } else if (AUDIO_FILE_EXTS.has(extMatch) || mime.startsWith("audio/")) {
      mediaKind = "audio";
    } else if (
      CODE_FILE_EXTS.has(extMatch) ||
      ["dockerfile", "makefile", ".gitignore", ".npmrc", ".eslintrc", ".prettierrc"].includes(baseLower)
    ) {
      mediaKind = "code";
    } else if (DOCUMENT_FILE_EXTS.has(extMatch) || mime.startsWith("text/")) {
      mediaKind = "document";
    }
    const resolvedMime =
      SAFE_MIME_BY_EXT[extMatch] ||
      (mime && mime !== "application/octet-stream" ? mime : "application/octet-stream");
    verified = {
      mimeType: resolvedMime,
      ext: safeExt,
      mediaKind,
      maxMb: MAX_FILE_UPLOAD_MB
    };
  }

  const maxBytes = verified.maxMb * 1024 * 1024;
  if (buffer.length > maxBytes) {
    return {
      error: `File exceeds the ${verified.maxMb} MB limit for ${verified.mediaKind} uploads.`
    };
  }

  return verified;
}

function getUserFromToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.id) {
      const dbUser = getUserByIdStmt.get(decoded.id);
      if (!dbUser) return null;
      return {
        id: dbUser.id,
        username: dbUser.username,
        isAdmin: Boolean(dbUser.is_admin)
      };
    }
    return null;
  } catch {
    return null;
  }
}

function authFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.cookies.synctune_token;
  return token ? getUserFromToken(token) : null;
}

function requireAuth(req, res, next) {
  const user = authFromRequest(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = authFromRequest(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  if (!user.isAdmin) return res.status(403).json({ error: "Admin access required" });
  req.user = user;
  next();
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportRecords() {
  return {
    users: getExportUsers.all().map(user => ({
      id: user.id,
      username: user.username,
      role: user.is_admin ? "Administrator" : "Member",
      created_at: user.created_at
    })),
    messages: getExportChatMessages.all().map(message => ({
      id: message.id,
      room_id: message.room_id || DEFAULT_ROOM_ID,
      username: message.username,
      message: message.message,
      reply_to_id: message.reply_to_id || "",
      created_at: new Date(message.created_at).toISOString()
    }))
  };
}

function pdfText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function addPdfHeading(doc, title) {
  doc.font("Helvetica-Bold").fontSize(18).text("SecureSphere database export");
  doc
    .moveDown(0.25)
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#666666")
    .text(`Generated ${new Date().toISOString()} - ${title}`);
  doc.moveDown(1).fillColor("#111111");
}

function ensurePdfSpace(doc, height) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    addPdfHeading(doc, "continued");
  }
}

function extractYouTubeId(input) {
  try {
    const url = new URL(input.trim());
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0];
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2];
    }
  } catch {}
  return null;
}

/* ── Google Gemini Intelligent Website Assistant API ───────── */
function getGeminiModelChain() {
  const seen = new Set();
  const list = [];
  for (const m of [GEMINI_PRIMARY_MODEL, ...GEMINI_FALLBACK_MODELS]) {
    if (m && !seen.has(m)) {
      seen.add(m);
      list.push(m);
    }
  }
  return list.length ? list : ["gemini-3.5-flash-lite", "gemini-3.7-flash"];
}

function getSectionLabel(sectionId, collabTab) {
  const map = {
    "#overviewCard": "Home / Room Overview",
    "#pluginsCard": "Apps & Integrations (YouTube & Games)",
    "#chatCard": collabTab === "whiteboard" ? "Collaborative Whiteboard" : "Friends Room / Team Chat",
    "#youtubePluginSection": "Synchronized YouTube Player & Shared Queue",
    "#voiceRoomCard": "Live Voice Channels",
    "#membersCard": "Room Members & Presence",
    "#roomsCard": "Rooms Switcher & Invitations",
    "#settingsCard": "Workspace Settings & Permissions",
    "#adminCard": "Administrator Panel & Exports",
    "#loginView": "Sign In / Create Room Screen"
  };
  return map[sectionId] || "SecureSphere Workspace";
}

function buildGeminiWebsiteContext(user, rawRoomId, clientContext = {}) {
  const activeSection = String(clientContext?.activeSection || "").slice(0, 64);
  const activeCollabTab = String(clientContext?.activeCollabTab || "discussion").slice(0, 32);
  const selectedIds = Array.isArray(clientContext?.selectedMessageIds)
    ? clientContext.selectedMessageIds.map(id => String(id).trim()).filter(Boolean).slice(0, 80)
    : [];

  const platformGuide = {
    name: "SecureSphere",
    summary:
      "Real-time private team workspace with multi-room collaboration, Team Chat (replies, emoji reactions, file/image/video/code sharing up to 50 MB), Collaborative Vector Whiteboard (live cursors, shapes, sticky notes, undo/redo, PNG/SVG export), Synchronized YouTube Shared Queue, WebRTC Voice Channels, Multiplayer Games (Chess, Ludo, Tic Tac Toe), Dark/Light themes, and Room Admin management.",
    currentView: getSectionLabel(activeSection || (user ? "#overviewCard" : "#loginView"), activeCollabTab)
  };

  if (!user) {
    return {
      authenticated: false,
      scope: "public",
      stats: { authenticated: false, currentView: platformGuide.currentView },
      contextText: JSON.stringify(
        {
          platform: platformGuide,
          user: { authenticated: false, note: "Guest on login screen. Only public platform features are accessible." }
        },
        null,
        2
      )
    };
  }

  const requestedCode = normalizeRoomCode(rawRoomId || DEFAULT_ROOM_ID) || DEFAULT_ROOM_ID;
  const dbRoom = getRoomByIdStmt.get(requestedCode);
  const hasRoomAccess = dbRoom && isUserMemberOfRoom(dbRoom.id, user);
  const targetRoomId = hasRoomAccess ? dbRoom.id : null;

  const accessibleRooms = getUserAccessibleRoomsStmt.all(user.username).map(r => {
    const rt = roomStates.get(r.id);
    const onlineCount = rt ? getRoomParticipants(r.id).count : 0;
    return {
      roomId: r.id,
      roomName: r.name,
      owner: r.created_by,
      yourRole: r.role,
      onlineNow: onlineCount
    };
  });

  const notifPayload = getUserNotificationsPayload(user.username);
  const recentNotifications = (notifPayload.notifications || []).slice(0, 12).map(n => ({
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: Boolean(n.isRead),
    createdAt: new Date(n.createdAt).toISOString()
  }));

  let roomSnapshot = null;
  let chatMessages = [];
  let selectedMessages = [];
  let stats = {
    authenticated: true,
    username: user.username,
    isAdmin: Boolean(user.isAdmin),
    roomId: targetRoomId || "NONE",
    roomName: dbRoom && hasRoomAccess ? dbRoom.name : "No Room Selected",
    currentView: platformGuide.currentView,
    onlineCount: 0,
    messageCount: 0,
    selectedCount: 0,
    mediaCount: 0,
    unreadNotifications: notifPayload.unreadCount || 0,
    activeGamesCount: 0,
    voiceParticipantsCount: 0,
    accessibleRoomsCount: accessibleRooms.length
  };

  if (targetRoomId) {
    const runtime = getRoomRuntime(targetRoomId);
    const participants = getRoomParticipants(targetRoomId);
    const history = getRoomChatHistory(targetRoomId);
    const recentHistory = history.slice(-120);
    const recentMedia = getRoomRecentMediaStmt.all(targetRoomId);
    const gamesState = getRoomGamesStatePayload(targetRoomId);
    const voiceState = buildRoomVoicePayload(targetRoomId);
    const voicePeopleCount = (voiceState.channels || []).reduce(
      (sum, ch) => sum + (Array.isArray(ch.participants) ? ch.participants.length : 0),
      0
    );

    const formatChatRow = m => {
      const reactionTotal = Object.values(m.reactions || {}).reduce(
        (sum, users) => sum + (Array.isArray(users) ? users.length : 0),
        0
      );
      return {
        id: m.id,
        author: m.username,
        text: String(m.message || "").slice(0, 800),
        time: new Date(m.createdAt).toISOString(),
        replyTo: m.replyTo ? `${m.replyTo.username}: ${String(m.replyTo.message || "").slice(0, 120)}` : undefined,
        attachment: m.media ? `${m.media.originalName} (${m.media.mediaKind})` : undefined,
        reactions: reactionTotal > 0 ? m.reactions : undefined
      };
    };

    chatMessages = recentHistory.map(formatChatRow);
    if (selectedIds.length > 0) {
      const idSet = new Set(selectedIds);
      selectedMessages = history.filter(m => idSet.has(String(m.id))).map(formatChatRow);
    }

    const activeMatches = (gamesState.matches || []).filter(m => m.status === "active" || m.status === "waiting");
    const completedMatches = (gamesState.matches || []).filter(m => m.status === "finished").slice(0, 5);

    roomSnapshot = {
      roomId: runtime.roomId,
      roomName: runtime.roomName,
      owner: runtime.owner,
      yourRole: isRoomOwnerOrAdmin(runtime, user) ? "Admin / Owner" : "Member",
      onlineCount: participants.count,
      onlineMembers: participants.members.map(m => ({ username: m.username, isAdmin: Boolean(m.isAdmin) })),
      enabledApps: {
        youtube: Boolean(runtime.plugins.youtube),
        games: Boolean(runtime.plugins.games)
      },
      youtube: runtime.plugins.youtube
        ? {
            currentVideoId: runtime.videoId || null,
            playing: Boolean(runtime.playing),
            queueLength: runtime.queue.length,
            upcomingQueue: runtime.queue.slice(0, 8).map(q => q.title || q.videoId || q.url)
          }
        : { enabled: false },
      whiteboard: {
        elementsCount: Array.isArray(runtime.whiteboardElements) ? runtime.whiteboardElements.length : 0,
        memberDrawAllowed: Boolean(runtime.whiteboardMemberDraw)
      },
      voice: {
        channels: (voiceState.channels || []).map(ch => ({
          name: ch.name,
          participants: (ch.participants || []).map(p => p.username)
        }))
      },
      games: {
        enabled: Boolean(runtime.plugins.games),
        activeMatches: activeMatches.slice(0, 8).map(m => ({
          type: m.gameType,
          status: m.status,
          players: m.players,
          winner: m.winner || null
        })),
        recentFinishedMatches: completedMatches.map(m => ({
          type: m.gameType,
          winner: m.winner || "draw",
          players: m.players
        }))
      },
      recentSharedFiles: recentMedia.slice(0, 12).map(f => ({
        name: f.original_name,
        kind: f.media_kind,
        uploadedBy: f.uploader_username,
        uploadedAt: new Date(f.created_at).toISOString()
      })),
      totalChatMessagesInRoom: history.length
    };

    stats = {
      ...stats,
      roomId: runtime.roomId,
      roomName: runtime.roomName,
      onlineCount: participants.count,
      messageCount: history.length,
      selectedCount: selectedMessages.length,
      mediaCount: recentMedia.length,
      activeGamesCount: activeMatches.length,
      voiceParticipantsCount: voicePeopleCount
    };
  }

  const contextObj = {
    platform: platformGuide,
    currentUser: {
      username: user.username,
      isAdmin: Boolean(user.isAdmin),
      totalRegisteredUsers: user.isAdmin ? countTotalUsersStmt.get()?.total || 0 : undefined
    },
    accessibleRooms,
    currentRoom: roomSnapshot,
    unreadNotificationsCount: notifPayload.unreadCount || 0,
    recentNotifications,
    selectedChatMessages: selectedMessages.length ? selectedMessages : undefined,
    recentChatHistory: chatMessages
  };

  return {
    authenticated: true,
    scope: targetRoomId ? `room:${targetRoomId}` : "account",
    stats,
    contextText: JSON.stringify(contextObj, null, 2)
  };
}

function buildGeminiModeInstruction(mode, selectedCount) {
  switch (mode) {
    case "summarize_short":
      return selectedCount > 0
        ? "Provide a crisp, 2-4 sentence executive summary of ONLY the selectedChatMessages."
        : "Provide a crisp, 2-4 sentence executive summary of the current room's recentChatHistory.";
    case "summarize_detailed":
      return selectedCount > 0
        ? "Provide a thorough, well-structured detailed summary of ONLY the selectedChatMessages, organized by topics, key points, decisions, and follow-ups."
        : "Provide a thorough, well-structured detailed summary of the current room's recentChatHistory, organized by topics, key points, decisions, shared files, and follow-ups.";
    case "summarize_bullets":
      return selectedCount > 0
        ? "Summarize ONLY the selectedChatMessages using concise, scannable Markdown bullet points."
        : "Summarize the current room's recentChatHistory using concise, scannable Markdown bullet points.";
    case "action_items":
      return "Extract all concrete decisions, tasks, owners (who mentioned or was assigned each item), and action items from the chat history (or selectedChatMessages if provided). Use a clean Markdown checklist. If there are no clear tasks yet, explicitly say so based on the actual data.";
    case "unanswered":
      return "Identify all unanswered questions, open threads, and pending discussions in the chat history (or selectedChatMessages if provided), quoting who asked each question. If everything appears answered or chat is empty, state that honestly.";
    case "website_overview":
      return "Give a clear, high-signal overview of everything currently happening across the user's accessible SecureSphere workspace: online members, recent chat activity, shared files, active voice channels, YouTube queue, whiteboard activity, games, and unread notifications. Only cite facts present in the provided data.";
    case "page_insights":
      return "Analyze what is relevant to the user's currentView section, explain its key capabilities, highlight any real activity or patterns visible in the workspace data for this area, and give 2-3 practical next-step recommendations.";
    case "search":
      return "Search strictly across the provided workspace data (chat messages, shared files, notifications, rooms, games, voice) to answer the user's query accurately, quoting exact authors and details where found.";
    default:
      return "Answer the user's request helpfully, accurately, and concisely using the live SecureSphere workspace context whenever relevant.";
  }
}

app.get("/api/gemini/status", (req, res) => {
  const user = authFromRequest(req);
  res.json({
    ok: true,
    configured: Boolean(geminiClient),
    model: GEMINI_PRIMARY_MODEL,
    authenticated: Boolean(user),
    username: user?.username || null
  });
});

app.get("/api/gemini/context-summary", requireAuth, (req, res) => {
  const roomId = String(req.query.roomId || DEFAULT_ROOM_ID);
  const activeSection = String(req.query.section || "");
  const activeCollabTab = String(req.query.collabTab || "discussion");
  const ctx = buildGeminiWebsiteContext(req.user, roomId, { activeSection, activeCollabTab });
  res.json({
    ok: true,
    configured: Boolean(geminiClient),
    model: GEMINI_PRIMARY_MODEL,
    stats: ctx.stats
  });
});

app.post("/api/gemini/stream", async (req, res) => {
  if (!geminiClient) {
    return res.status(503).json({
      ok: false,
      error: "Gemini API key is not configured on the server. Set GEMINI_API_KEY in .env."
    });
  }

  const user = authFromRequest(req);
  const prompt = String(req.body?.prompt || "").trim().slice(0, 8000);
  const mode = String(req.body?.mode || "chat").trim().slice(0, 40);
  const roomId = String(req.body?.roomId || DEFAULT_ROOM_ID);
  const selectedMessageIds = Array.isArray(req.body?.selectedMessageIds) ? req.body.selectedMessageIds : [];
  const activeSection = String(req.body?.activeSection || "");
  const activeCollabTab = String(req.body?.activeCollabTab || "discussion");
  const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];

  if (!prompt && mode === "chat") {
    return res.status(400).json({ ok: false, error: "Please enter a question or choose a quick action." });
  }

  const ctx = buildGeminiWebsiteContext(user, roomId, {
    activeSection,
    activeCollabTab,
    selectedMessageIds
  });

  const modeDirective = buildGeminiModeInstruction(mode, ctx.stats.selectedCount || 0);
  const systemInstruction = [
    "You are Gemini AI, the official intelligent assistant integrated into SecureSphere.",
    "STRICT GROUNDING & PRIVACY RULES:",
    "1. Use ONLY the real website/workspace data supplied in LIVE_WORKSPACE_CONTEXT below. NEVER invent or hallucinate fake chat messages, fake users, fake notifications, or fake events.",
    "2. If a room has 0 messages or no activity in a category, state that clearly and helpfully.",
    "3. Respect privacy and permissions: never claim to see rooms or admin data outside LIVE_WORKSPACE_CONTEXT.",
    "4. Format responses cleanly in GitHub-flavored Markdown (concise headings, bullet points, bold highlights, checklists, tables, and fenced code blocks where appropriate). NEVER wrap inline variables, ordinals, or math in raw LaTeX `$...$` or `\\(...\\)` delimiters (for example, write `i-th row`, `n × m`, `O(n²)`, `≤`, `≥`, `→` directly in clean plain text/Unicode instead of `$i$-th row` or `$n \\times m$`).",
    `CURRENT TASK DIRECTIVE: ${modeDirective}`,
    "",
    "LIVE_WORKSPACE_CONTEXT:",
    ctx.contextText
  ].join("\n");

  const contents = [];
  for (const turn of rawHistory.slice(-10)) {
    if (!turn || typeof turn !== "object") continue;
    const role = turn.role === "model" ? "model" : "user";
    const text = String(turn.text || "").trim().slice(0, 4000);
    if (!text) continue;
    contents.push({ role, parts: [{ text }] });
  }
  const effectivePrompt =
    prompt ||
    (mode === "website_overview"
      ? "Summarize everything happening across my SecureSphere workspace right now."
      : mode === "page_insights"
      ? "Give me insights and recommendations for the current page."
      : mode === "action_items"
      ? "Extract all decisions, tasks, and action items."
      : mode === "unanswered"
      ? "List any unanswered questions or pending discussions."
      : "Summarize the conversation.");
  contents.push({ role: "user", parts: [{ text: effectivePrompt }] });

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  let clientClosed = false;
  res.on("close", () => {
    if (!res.writableEnded) clientClosed = true;
  });

  const sendEvent = payload => {
    if (clientClosed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const modelsToTry = getGeminiModelChain();
  let lastError = null;
  let succeeded = false;

  for (const modelName of modelsToTry) {
    if (clientClosed) break;
    try {
      const stream = await geminiClient.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          systemInstruction,
          temperature: 0.4,
          maxOutputTokens: 2048
        }
      });

      let emittedAny = false;
      for await (const chunk of stream) {
        if (clientClosed) break;
        const delta = typeof chunk?.text === "string" ? chunk.text : "";
        if (!delta) continue;
        if (!emittedAny) {
          emittedAny = true;
          sendEvent({
            type: "meta",
            model: modelName,
            scope: ctx.scope,
            stats: ctx.stats
          });
        }
        sendEvent({ type: "delta", text: delta });
      }

      if (!clientClosed) {
        if (!emittedAny) {
          sendEvent({ type: "meta", model: modelName, scope: ctx.scope, stats: ctx.stats });
          sendEvent({
            type: "delta",
            text: "I didn't receive a text response for that request. Please try rephrasing or clicking Retry."
          });
        }
        sendEvent({ type: "done", model: modelName });
      }
      succeeded = true;
      break;
    } catch (err) {
      lastError = err;
      const status = Number(err?.status || 0);
      const msg = String(err?.message || err || "");
      const isRetryable =
        status === 429 ||
        status === 503 ||
        status === 500 ||
        status === 404 ||
        /high demand|overloaded|quota|rate limit|unavailable|not found/i.test(msg);
      if (!isRetryable) break;
    }
  }

  if (!succeeded && !clientClosed) {
    const rawMsg = String(lastError?.message || "Unable to reach Gemini right now.");
    const friendlyMsg =
      lastError?.status === 429 || /quota|rate limit/i.test(rawMsg)
        ? "Gemini API quota or rate limit was reached. Please wait a moment and click Retry."
        : lastError?.status === 503 || /high demand|overloaded/i.test(rawMsg)
        ? "Gemini is experiencing temporary high demand. Please click Retry in a moment."
        : lastError?.status === 401 || lastError?.status === 403 || /api key/i.test(rawMsg)
        ? "Gemini API authentication failed. Please verify GEMINI_API_KEY in .env."
        : "Gemini could not complete this request right now. Please click Retry.";
    sendEvent({ type: "error", message: friendlyMsg });
  }

  if (!res.writableEnded) res.end();
});

/* ── HTTP API Routes ───────────────────────────────────────── */
app.get("/api/config", (req, res) => {
  const runtime = getRoomRuntime(DEFAULT_ROOM_ID);
  res.json({
    roomId: runtime.roomId,
    roomName: runtime.roomName,
    roomOpenedAt: runtime.roomOpenedAt
  });
});

function resolveOrCreateUser(rawUsername, rawPassword, requirePasswordForNew = false) {
  const username = String(rawUsername || "").trim();
  const password = String(rawPassword || "");

  if (!username || username.length < 2 || username.length > 30) {
    return { error: "Please enter your name or username (2–30 characters).", status: 400 };
  }
  if (!/^[a-zA-Z0-9_.\-\s]{2,30}$/.test(username)) {
    return {
      error: "Username can only use letters, numbers, spaces, _, ., or -",
      status: 400
    };
  }

  let user = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username);

  if (user) {
    if (user.is_admin) {
      if (!password || !bcrypt.compareSync(password, user.password_hash)) {
        return {
          error: "This username belongs to an administrator. Enter the admin password or choose another name.",
          status: 401
        };
      }
      return { user };
    }
    if (password) {
      if (!bcrypt.compareSync(password, user.password_hash)) {
        return {
          error: "Incorrect password for this username, or choose a different name.",
          status: 401
        };
      }
    }
    return { user };
  }

  if (requirePasswordForNew && !password) {
    return { error: "Please enter a password to sign in.", status: 400 };
  }

  const secretToHash = password.length > 0 ? password : crypto.randomBytes(16).toString("hex");
  const info = db
    .prepare("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)")
    .run(username, bcrypt.hashSync(secretToHash, 10));
  user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  return { user };
}

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    return res.status(400).json({ error: "Please enter both username and password" });
  }
  const resolved = resolveOrCreateUser(username, password, true);
  if (resolved.error) {
    return res.status(resolved.status || 401).json({ error: resolved.error });
  }
  const { user } = resolved;
  const authToken = signUser(user);
  setAuthCookie(res, authToken);
  recordRoomMembership(DEFAULT_ROOM_ID, {
    id: user.id,
    username: user.username,
    isAdmin: Boolean(user.is_admin)
  });
  res.json({
    token: authToken,
    username: user.username,
    isAdmin: Boolean(user.is_admin)
  });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("synctune_token", { path: "/" });
  res.json({ ok: true });
});

app.post("/api/auth/create-room", (req, res) => {
  const resolved = resolveOrCreateUser(req.body?.username, req.body?.password, false);
  if (resolved.error) {
    return res.status(resolved.status || 400).json({ error: resolved.error });
  }
  const { user } = resolved;
  const rawName = String(req.body?.roomName || "").trim().slice(0, 60);
  const roomName = rawName || `${user.username}'s Room`;
  const roomId = generateUniqueRoomId();
  try {
    insertRoomStmt.run(roomId, roomName, user.username);
    const runtime = getRoomRuntime(roomId);
    const authToken = signUser(user);
    setAuthCookie(res, authToken);
    recordRoomMembership(
      runtime.roomId,
      { id: user.id, username: user.username, isAdmin: Boolean(user.is_admin) },
      "owner"
    );
    res.status(201).json({
      token: authToken,
      username: user.username,
      isAdmin: Boolean(user.is_admin),
      roomId: runtime.roomId,
      roomName: runtime.roomName,
      createdBy: user.username,
      inviteUrl: `/?room=${encodeURIComponent(runtime.roomId)}`
    });
  } catch (error) {
    console.error("Unable to create room from entry page", error);
    res.status(500).json({ error: "Unable to create room. Please try again." });
  }
});

app.post("/api/auth/enter-room", (req, res) => {
  const code = normalizeRoomCode(req.body?.roomId);
  if (!code) {
    return res.status(400).json({ error: "Please enter a valid Room ID or invitation code." });
  }
  const room = getRoomByIdStmt.get(code);
  if (!room) {
    return res.status(404).json({ error: "Room not found. Please check the Room ID and try again." });
  }
  const resolved = resolveOrCreateUser(req.body?.username, req.body?.password, false);
  if (resolved.error) {
    return res.status(resolved.status || 400).json({ error: resolved.error });
  }
  const { user } = resolved;
  const runtime = getRoomRuntime(room.id);
  const authToken = signUser(user);
  setAuthCookie(res, authToken);
  recordRoomMembership(runtime.roomId, {
    id: user.id,
    username: user.username,
    isAdmin: Boolean(user.is_admin)
  });
  res.json({
    token: authToken,
    username: user.username,
    isAdmin: Boolean(user.is_admin),
    roomId: runtime.roomId,
    roomName: runtime.roomName,
    createdBy: room.created_by
  });
});

/* ── Room Management Endpoints ─────────────────────────────── */
app.post("/api/rooms", requireAuth, (req, res) => {
  const rawName = String(req.body?.name || "").trim().slice(0, 60);
  const roomName = rawName || `${req.user.username}'s Room`;
  const roomId = generateUniqueRoomId();
  try {
    insertRoomStmt.run(roomId, roomName, req.user.username);
    const runtime = getRoomRuntime(roomId);
    recordRoomMembership(runtime.roomId, req.user, "owner");
    res.status(201).json({
      roomId: runtime.roomId,
      roomName: runtime.roomName,
      createdBy: req.user.username,
      inviteUrl: `/?room=${encodeURIComponent(runtime.roomId)}`
    });
  } catch (error) {
    console.error("Unable to create room", error);
    res.status(500).json({ error: "Unable to create room. Please try again." });
  }
});

app.post("/api/rooms/join", requireAuth, (req, res) => {
  const code = normalizeRoomCode(req.body?.roomId);
  if (!code) {
    return res.status(400).json({ error: "Please enter a valid Room ID or invitation code." });
  }
  const room = getRoomByIdStmt.get(code);
  if (!room) {
    return res.status(404).json({ error: "Room not found. Please check the Room ID and try again." });
  }
  const runtime = getRoomRuntime(room.id);
  recordRoomMembership(runtime.roomId, req.user);
  const { count, participants } = getRoomParticipants(room.id);
  res.json({
    roomId: runtime.roomId,
    roomName: runtime.roomName,
    createdBy: room.created_by,
    createdAt: room.created_at,
    onlineCount: count,
    participants
  });
});

app.get("/api/rooms/:roomId", requireAuth, (req, res) => {
  const code = normalizeRoomCode(req.params.roomId);
  if (!code) {
    return res.status(400).json({ error: "Invalid Room ID." });
  }
  const room = getRoomByIdStmt.get(code);
  if (!room) {
    return res.status(404).json({ error: "Room not found." });
  }
  if (!isUserMemberOfRoom(room.id, req.user)) {
    return res.status(403).json({ error: "You are not authorized to access this room." });
  }
  const runtime = getRoomRuntime(room.id);
  const { count, participants } = getRoomParticipants(room.id);
  res.json({
    roomId: runtime.roomId,
    roomName: runtime.roomName,
    createdBy: room.created_by,
    createdAt: room.created_at,
    onlineCount: count,
    participants
  });
});

/* ── Admin Endpoints ───────────────────────────────────────── */
app.post("/api/admin/users", requireAdmin, (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return res
      .status(400)
      .json({ error: "Username must be 3-30 characters and use letters, numbers, _, ., or -" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  try {
    db.prepare("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)").run(
      username,
      bcrypt.hashSync(password, 12)
    );
    res.json({ message: `User ${username} created` });
  } catch {
    res.status(409).json({ error: "Username already exists" });
  }
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const users = db.prepare("SELECT id, username, is_admin, created_at FROM users ORDER BY id ASC").all();
  res.json({ users });
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare("SELECT id, username, is_admin FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.is_admin) return res.status(400).json({ error: "Admin account cannot be deleted" });
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ message: `User ${user.username} deleted` });
});

app.put("/api/admin/users/:id/password", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body.password || "");
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  const user = db.prepare("SELECT username FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "User not found" });
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(password, 12), id);
  res.json({ message: `Password updated for ${user.username}` });
});

app.put("/api/admin/users/:id/role", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const nextIsAdmin = Boolean(req.body?.isAdmin);
  const targetUser = db.prepare("SELECT id, username, is_admin FROM users WHERE id = ?").get(id);
  if (!targetUser) return res.status(404).json({ error: "User not found" });
  if (targetUser.username.toLowerCase() === ADMIN_USERNAME.toLowerCase() && !nextIsAdmin) {
    return res.status(400).json({ error: "Primary system administrator cannot be demoted." });
  }
  if (targetUser.id === req.user.id && !nextIsAdmin) {
    return res.status(400).json({ error: "You cannot revoke your own administrator role here." });
  }

  updateUserAdminRoleStmt.run(nextIsAdmin ? 1 : 0, id);

  const affectedRooms = new Set();
  for (const [, s] of io.sockets.sockets) {
    if (s.user?.username && s.user.username.toLowerCase() === targetUser.username.toLowerCase()) {
      s.user.isAdmin = nextIsAdmin;
      s.emit("accountRoleUpdated", { username: s.user.username, isAdmin: nextIsAdmin });
      if (s.currentRoomId) affectedRooms.add(s.currentRoomId);
    }
  }
  for (const rid of affectedRooms) {
    emitRoomPresence(rid);
    emitState(rid);
    emitGamesLobbyState(rid);
  }

  res.json({
    ok: true,
    username: targetUser.username,
    isAdmin: nextIsAdmin,
    message: nextIsAdmin
      ? `${targetUser.username} is now an Administrator`
      : `Administrator role removed from ${targetUser.username}`
  });
});

app.get("/api/admin/exports/database.csv", requireAdmin, (req, res) => {
  try {
    const { users, messages } = exportRecords();
    const rows = [
      ["Accounts"],
      ["ID", "Username", "Role", "Created at"],
      ...users.map(user => [user.id, user.username, user.role, user.created_at]),
      [],
      ["Chat messages"],
      ["ID", "Room ID", "Username", "Message", "Reply To ID", "Created at"],
      ...messages.map(message => [
        message.id,
        message.room_id,
        message.username,
        message.message,
        message.reply_to_id,
        message.created_at
      ])
    ];
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}`;
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="securesphere-database-export.csv"'
    });
    res.send(csv);
  } catch (error) {
    console.error("Unable to create database CSV export", error);
    res.status(500).json({ error: "Unable to create database export" });
  }
});

app.get("/api/admin/exports/database.pdf", requireAdmin, (req, res) => {
  let doc;
  try {
    const { users, messages } = exportRecords();
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="securesphere-database-export.pdf"'
    });
    doc = new PDFDocument({ margin: 48 });
    doc.on("error", error => {
      console.error("Unable to stream database PDF export", error);
      if (!res.headersSent) res.status(500).json({ error: "Unable to create database export" });
      else res.destroy(error);
    });
    doc.pipe(res);
    addPdfHeading(doc, "accounts and chat messages");
    doc.font("Helvetica").fontSize(10).text(`Accounts: ${users.length}   |   Chat messages: ${messages.length}`);
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(13).text("Accounts");
    doc.moveDown(0.4);
    for (const user of users) {
      const line = `#${user.id}  ${user.username}  |  ${user.role}  |  Created: ${user.created_at}`;
      const safeLine = pdfText(line);
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      ensurePdfSpace(doc, doc.heightOfString(safeLine, { width }) + 8);
      doc.font("Helvetica").fontSize(9).text(safeLine);
      doc.moveDown(0.3);
    }
    doc.moveDown();
    ensurePdfSpace(doc, 32);
    doc.font("Helvetica-Bold").fontSize(13).text("Chat messages");
    doc.moveDown(0.4);
    for (const message of messages) {
      const heading = pdfText(
        `#${message.id}  [${message.room_id}]  ${message.username}  |  ${message.created_at}`
      );
      const safeMessage = pdfText(message.message);
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const blockHeight =
        doc.heightOfString(heading, { width }) + doc.heightOfString(safeMessage, { width }) + 12;
      ensurePdfSpace(doc, blockHeight);
      doc.font("Helvetica-Bold").fontSize(8).text(heading);
      doc.font("Helvetica").fontSize(9).text(safeMessage);
      doc.moveDown(0.6);
    }
    doc.end();
  } catch (error) {
    console.error("Unable to create database PDF export", error);
    if (doc && !res.headersSent) doc.end();
    if (!res.headersSent) res.status(500).json({ error: "Unable to create database export" });
    else res.destroy(error);
  }
});

app.get("/api/me", (req, res) => {
  const user = authFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ") && !req.cookies?.synctune_token) {
    setAuthCookie(res, header.slice(7));
  }
  res.json({ username: user.username, isAdmin: Boolean(user.isAdmin) });
});

app.get("/api/state", (req, res) => {
  const user = authFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const roomId = normalizeRoomCode(req.query.roomId) || DEFAULT_ROOM_ID;
  if (!isUserMemberOfRoom(roomId, user)) {
    return res.status(403).json({ error: "You are not authorized to access this room." });
  }
  res.json(publicState(roomId));
});

app.get("/api/rooms/:roomId/collaboration", requireAuth, (req, res) => {
  const code = normalizeRoomCode(req.params.roomId);
  if (!code) return res.status(400).json({ error: "Invalid Room ID." });
  const room = getRoomByIdStmt.get(code);
  if (!room) return res.status(404).json({ error: "Room not found." });
  if (!isUserMemberOfRoom(room.id, req.user)) {
    return res.status(403).json({ error: "You are not authorized to access this room's collaboration data." });
  }
  res.json({
    state: publicState(room.id),
    chatHistory: getRoomChatHistory(room.id),
    aiSessionState: getRoomAiCollaborationState(room.id),
    whiteboardState: getWhiteboardStatePayload(room.id)
  });
});

app.post(
  "/api/rooms/:roomId/media",
  requireAuth,
  express.raw({ type: () => true, limit: `${Math.max(MAX_VIDEO_UPLOAD_MB + 5, 55)}mb` }),
  (req, res) => {
    const code = normalizeRoomCode(req.params.roomId);
    if (!code) return res.status(400).json({ error: "Invalid Room ID." });
    const room = getRoomByIdStmt.get(code);
    if (!room) return res.status(404).json({ error: "Room not found." });
    if (!isUserMemberOfRoom(room.id, req.user)) {
      return res.status(403).json({ error: "Only members of this room can upload media." });
    }

    let rawName = "upload";
    try {
      rawName = decodeURIComponent(String(req.headers["x-file-name"] || "upload"));
    } catch {
      rawName = String(req.headers["x-file-name"] || "upload");
    }
    const safeName =
      path
        .basename(rawName)
        .replace(/[\r\n\t\0<>:"/\\|?*]/g, "_")
        .slice(0, 120) || "media";
    const declaredMime = String(req.headers["x-mime-type"] || req.headers["content-type"] || "");

    const check = validateMediaBuffer(req.body, declaredMime, safeName);
    if (check.error) {
      return res.status(400).json({ error: check.error });
    }

    const mediaId = crypto.randomUUID();
    const roomUploadDir = path.join(uploadsDir, room.id);
    fs.mkdirSync(roomUploadDir, { recursive: true });
    const storedName = `${mediaId}.${check.ext}`;
    const fullPath = path.join(roomUploadDir, storedName);

    try {
      fs.writeFileSync(fullPath, req.body);
      const createdAt = Date.now();
      insertMediaStmt.run(
        mediaId,
        room.id,
        req.user.username,
        req.user.id || null,
        safeName,
        storedName,
        check.mimeType,
        check.mediaKind,
        req.body.length,
        createdAt
      );
      const media = {
        id: mediaId,
        roomId: room.id,
        originalName: safeName,
        mimeType: check.mimeType,
        mediaKind: check.mediaKind,
        fileSize: req.body.length,
        uploaderUsername: req.user.username,
        createdAt,
        url: `/api/media/${encodeURIComponent(mediaId)}`
      };
      res.status(201).json({ media });
    } catch (error) {
      console.error("Failed to save uploaded media", error);
      try { fs.unlinkSync(fullPath); } catch {}
      res.status(500).json({ error: "Unable to save uploaded media." });
    }
  }
);

app.get("/api/media/:mediaId", requireAuth, (req, res) => {
  const mediaId = String(req.params.mediaId || "").trim();
  const record = getMediaByIdStmt.get(mediaId);
  if (!record) return res.status(404).json({ error: "Media attachment not found." });

  if (!isUserMemberOfRoom(record.room_id, req.user)) {
    return res.status(403).json({ error: "You are not authorized to access media from this room." });
  }

  const filePath = path.join(uploadsDir, record.room_id, path.basename(record.stored_name));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Stored media file is missing." });
  }

  const stat = fs.statSync(filePath);
  const totalSize = stat.size;
  const isSafePreview =
    req.query.preview === "1" &&
    ["code", "document"].includes(record.media_kind) &&
    totalSize <= 512 * 1024;
  const allowInlineKinds = new Set(["image", "video", "audio", "pdf"]);
  const forceAttachment =
    req.query.download === "1" || (!isSafePreview && !allowInlineKinds.has(record.media_kind));
  const disposition = forceAttachment ? "attachment" : "inline";
  const safeDownloadName = String(record.original_name || "file").replace(/["\r\n\\]/g, "_");

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (!["image", "video", "audio"].includes(record.media_kind) || isSafePreview) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  }
  res.setHeader("Content-Type", isSafePreview ? "text/plain; charset=utf-8" : record.mime_type);
  res.setHeader("Content-Disposition", `${disposition}; filename="${safeDownloadName}"`);
  res.setHeader("Accept-Ranges", "bytes");

  const rangeHeader = req.headers.range;
  if (rangeHeader && /^bytes=\d*-\d*$/.test(rangeHeader)) {
    const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
    const start = startStr ? parseInt(startStr, 10) : 0;
    const end = endStr ? Math.min(parseInt(endStr, 10), totalSize - 1) : totalSize - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
      return res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.setHeader("Content-Length", totalSize);
  fs.createReadStream(filePath).pipe(res);
});

/* ── WebRTC ICE / STUN / TURN Configuration Endpoint ───────── */
function buildIceServersConfig(username) {
  if (process.env.VOICE_ICE_SERVERS_JSON) {
    const parsed = safeJsonParse(process.env.VOICE_ICE_SERVERS_JSON, null);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return {
        iceServers: parsed,
        hasTurn: parsed.some(s => String(s?.urls || "").includes("turn"))
      };
    }
  }

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ];

  let hasTurn = false;
  const turnUrls = String(process.env.TURN_URLS || "")
    .split(",")
    .map(u => u.trim())
    .filter(Boolean);

  if (turnUrls.length > 0) {
    if (process.env.TURN_SHARED_SECRET) {
      // RFC / coturn use-auth-secret HMAC-SHA1 time-limited credentials (12h TTL)
      const ttlSeconds = 12 * 3600;
      const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
      const cleanUser = String(username || "user").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 40);
      const turnUsername = `${expiry}:${cleanUser}`;
      const turnCredential = crypto
        .createHmac("sha1", process.env.TURN_SHARED_SECRET)
        .update(turnUsername)
        .digest("base64");
      iceServers.push({
        urls: turnUrls,
        username: turnUsername,
        credential: turnCredential
      });
      hasTurn = true;
    } else if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: turnUrls,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      });
      hasTurn = true;
    }
  }

  return { iceServers, hasTurn };
}

app.get("/api/voice/ice-config", requireAuth, (req, res) => {
  const cfg = buildIceServersConfig(req.user.username);
  res.json({
    ok: true,
    iceServers: cfg.iceServers,
    hasTurn: cfg.hasTurn
  });
});

/* ── Socket.IO Real-Time Multi-Room Engine ─────────────────── */
const CURSOR_COLORS = [
  "#9e8cfc",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#fbbf24",
  "#fb7185",
  "#2dd4bf",
  "#a78bfa"
];

function getCursorColorForUser(username) {
  let hash = 0;
  const s = String(username || "user");
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

function ensureRoomVoiceChannels(roomId) {
  const runtime = getRoomRuntime(roomId);
  let channels = getRoomVoiceChannelsStmt.all(runtime.roomId);
  if (!channels.length) {
    const defaultId = `vc-${runtime.roomId.toLowerCase()}-general`;
    insertVoiceChannelStmt.run(defaultId, runtime.roomId, "General Voice", "System", 1, Date.now());
    channels = getRoomVoiceChannelsStmt.all(runtime.roomId);
  }
  return channels;
}

function buildRoomVoicePayload(roomId) {
  const runtime = getRoomRuntime(roomId);
  const rows = ensureRoomVoiceChannels(runtime.roomId);
  const channels = rows.map(ch => {
    const pMap = runtime.voiceParticipants.get(ch.id);
    const participants = pMap
      ? Array.from(pMap.values()).sort((a, b) => a.joinedAt - b.joinedAt)
      : [];
    return {
      id: ch.id,
      roomId: runtime.roomId,
      name: ch.name,
      createdBy: ch.created_by,
      isDefault: Boolean(ch.is_default),
      createdAt: ch.created_at,
      participants
    };
  });
  return { roomId: runtime.roomId, channels };
}

function emitVoiceChannelsState(roomId) {
  const runtime = getRoomRuntime(roomId);
  io.to(socketRoomKey(runtime.roomId)).emit("voice:channelsUpdated", buildRoomVoicePayload(runtime.roomId));
}

function leaveCurrentVoiceChannel(socket) {
  const prevVoice = socket.currentVoice;
  if (!prevVoice || !prevVoice.roomId || !prevVoice.channelId) return false;
  const runtime = getRoomRuntime(prevVoice.roomId);
  const pMap = runtime.voiceParticipants.get(prevVoice.channelId);
  socket.currentVoice = null;
  if (pMap && pMap.has(socket.id)) {
    pMap.delete(socket.id);
    for (const peerSocketId of pMap.keys()) {
      const peerSocket = io.sockets.sockets.get(peerSocketId);
      if (peerSocket) {
        peerSocket.emit("voice:peerLeft", {
          roomId: runtime.roomId,
          channelId: prevVoice.channelId,
          socketId: socket.id,
          username: socket.user?.username || ""
        });
      }
    }
    if (pMap.size === 0) {
      runtime.voiceParticipants.delete(prevVoice.channelId);
    }
  }
  emitVoiceChannelsState(runtime.roomId);
  return true;
}

function leaveCurrentSocketRoom(socket) {
  const prevRoomId = socket.currentRoomId;
  if (!prevRoomId) return;
  leaveCurrentVoiceChannel(socket);
  const prevRuntime = getRoomRuntime(prevRoomId);
  if (prevRuntime.whiteboardCursors.has(socket.id)) {
    prevRuntime.whiteboardCursors.delete(socket.id);
    io.to(socketRoomKey(prevRoomId)).emit("whiteboard:cursor:remove", { socketId: socket.id });
  }
  socket.leave(socketRoomKey(prevRoomId));
  if (!socket.user.isAdmin) {
    socket.leave(listenerRoomKey(prevRoomId));
    const remainingListeners = io.sockets.adapter.rooms.get(listenerRoomKey(prevRoomId))?.size || 0;
    if (remainingListeners === 0) {
      prevRuntime.roomOpenedAt = null;
      emitRoomStatus(prevRoomId);
    }
  }
  const stillOnline = getRoomParticipants(prevRoomId).members.some(
    m => m.username.toLowerCase() === String(socket.user.username || "").toLowerCase()
  );
  if (!stillOnline && socket.user?.username) {
    const leaveWindow = Math.floor(Date.now() / 30000);
    notifyRoomParticipants(
      prevRoomId,
      socket.user.username,
      () => ({
        type: "room_leave",
        title: "Player Left Room",
        message: `${socket.user.username} left ${prevRuntime.roomName}.`,
        targetType: "members",
        targetId: prevRoomId,
        dedupKey: `leave:${prevRoomId}:${socket.user.username}:${leaveWindow}`
      }),
      true
    );
  }
  emitRoomPresence(prevRoomId);
  socket.currentRoomId = null;
}

function joinSocketToRoom(socket, targetRoomId) {
  const code = normalizeRoomCode(targetRoomId) || DEFAULT_ROOM_ID;
  const dbRoom = getRoomByIdStmt.get(code) || getRoomByIdStmt.get(DEFAULT_ROOM_ID);
  const canonicalId = dbRoom.id;

  if (socket.currentRoomId && socket.currentRoomId !== canonicalId) {
    leaveCurrentSocketRoom(socket);
  }

  const wasOnlineBeforeJoin = getRoomParticipants(canonicalId).members.some(
    m => m.username.toLowerCase() === String(socket.user.username || "").toLowerCase()
  );

  const runtime = getRoomRuntime(canonicalId);
  socket.currentRoomId = canonicalId;
  socket.join(socketRoomKey(canonicalId));
  recordRoomMembership(canonicalId, socket.user);

  if (!socket.user.isAdmin) {
    socket.join(listenerRoomKey(canonicalId));
    const listenerCount = io.sockets.adapter.rooms.get(listenerRoomKey(canonicalId))?.size || 0;
    if (listenerCount === 1 && !runtime.roomOpenedAt) {
      runtime.roomOpenedAt = Date.now();
    }
  }

  socket.emit("state", publicState(canonicalId));
  socket.emit("chatHistory", getRoomChatHistory(canonicalId));
  socket.emit("aiSessionState", getRoomAiCollaborationState(canonicalId));
  socket.emit("whiteboardState", getWhiteboardStatePayload(canonicalId));
  socket.emit("games:lobbyState", getRoomGamesStatePayload(canonicalId));
  socket.emit("notifications:state", getUserNotificationsPayload(socket.user.username));
  socket.emit("voice:channelsUpdated", buildRoomVoicePayload(canonicalId));
  emitRoomPresence(canonicalId);
  emitRoomStatus(canonicalId);

  if (!wasOnlineBeforeJoin && socket.user?.username) {
    const joinWindow = Math.floor(Date.now() / 30000);
    notifyRoomParticipants(
      canonicalId,
      socket.user.username,
      () => ({
        type: "room_join",
        title: "Player Joined Room",
        message: `${socket.user.username} joined ${runtime.roomName}.`,
        targetType: "members",
        targetId: canonicalId,
        dedupKey: `join:${canonicalId}:${socket.user.username}:${joinWindow}`
      }),
      true
    );
  }

  return runtime;
}

io.use((socket, next) => {
  const user = getUserFromToken(socket.handshake.auth?.token);
  if (!user) return next(new Error("Unauthorized"));
  socket.user = user;
  next();
});

io.on("connection", socket => {
  const requestedRoom = normalizeRoomCode(socket.handshake.auth?.roomId);
  const initialRoom = requestedRoom && getRoomByIdStmt.get(requestedRoom) ? requestedRoom : DEFAULT_ROOM_ID;
  joinSocketToRoom(socket, initialRoom);

  socket.on("joinRoom", (payload, ack) => {
    const rawCode = typeof payload === "object" && payload !== null ? payload.roomId : payload;
    const code = normalizeRoomCode(rawCode);
    if (!code) {
      ack?.({ ok: false, error: "Please provide a valid Room ID." });
      return;
    }
    const dbRoom = getRoomByIdStmt.get(code);
    if (!dbRoom) {
      ack?.({ ok: false, error: "Room not found. Please check the Room ID and try again." });
      return;
    }
    const runtime = joinSocketToRoom(socket, dbRoom.id);
    const { count, participants, members } = getRoomParticipants(runtime.roomId);
    ack?.({
      ok: true,
      roomId: runtime.roomId,
      roomName: runtime.roomName,
      owner: runtime.owner,
      allowMemberPluginToggle: Boolean(runtime.allowMemberPluginToggle),
      activeAiPlatform: runtime.activeAiPlatform || null,
      whiteboardMemberDraw: Boolean(runtime.whiteboardMemberDraw),
      plugins: { ...runtime.plugins },
      onlineCount: count,
      participants,
      members
    });
  });

  socket.on("setPluginState", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    const pluginId = String(payload?.pluginId || "").toLowerCase();
    const enabled = Boolean(payload?.enabled);

    if (!["youtube", "games"].includes(pluginId)) {
      ack?.({ ok: false, error: "Unknown plugin identifier." });
      return;
    }

    if (!isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({
        ok: false,
        error: `Only the Room Admin / Workspace Owner (${runtime.owner}) can enable or disable plugins and features.`
      });
      return;
    }

    runtime.plugins[pluginId] = enabled;
    persistRoomPluginState(runtime);
    emitState(roomId);
    if (pluginId === "games") {
      emitGamesLobbyState(roomId);
    }

    ack?.({
      ok: true,
      pluginId,
      enabled,
      plugins: { ...runtime.plugins }
    });
  });

  socket.on("room:switchAdmin", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({
        ok: false,
        error: `Only the current Room Admin (${runtime.owner}) can transfer admin rights.`
      });
      return;
    }

    const rawTarget = String(payload?.targetUsername || "").trim();
    if (!rawTarget) {
      ack?.({ ok: false, error: "Select a room member to switch admin to." });
      return;
    }

    const targetDbUser = getUserByUsernameInsensitiveStmt.get(rawTarget);
    const { members } = getRoomParticipants(runtime.roomId);
    const onlineTarget = members.find(m => m.username.toLowerCase() === rawTarget.toLowerCase());
    if (!targetDbUser && !onlineTarget) {
      ack?.({ ok: false, error: `User "${rawTarget}" was not found.` });
      return;
    }

    const canonicalTarget = targetDbUser ? targetDbUser.username : onlineTarget.username;
    const previousAdmin = runtime.owner;

    updateRoomOwnerStmt.run(canonicalTarget, runtime.roomId);
    runtime.owner = canonicalTarget;
    clearRoomOwnerMembershipStmt.run(runtime.roomId);
    upsertRoomMembershipStmt.run(
      runtime.roomId,
      canonicalTarget,
      targetDbUser?.id || null,
      "owner",
      Date.now()
    );

    emitState(runtime.roomId);
    emitRoomPresence(runtime.roomId);
    emitAiSessionState(runtime.roomId);
    emitGamesLobbyState(runtime.roomId);
    io.to(socketRoomKey(runtime.roomId)).emit("adminSwitched", {
      roomId: runtime.roomId,
      newAdmin: canonicalTarget,
      previousAdmin,
      switchedBy: socket.user.username
    });

    ack?.({
      ok: true,
      roomId: runtime.roomId,
      owner: canonicalTarget,
      previousAdmin
    });
  });

  socket.on("setWorkspaceSettings", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);

    if (!isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({
        ok: false,
        error: `Only the workspace owner (${runtime.owner}) can modify team permissions.`
      });
      return;
    }

    if (typeof payload?.allowMemberPluginToggle === "boolean") {
      runtime.allowMemberPluginToggle = payload.allowMemberPluginToggle;
    }
    if (typeof payload?.whiteboardMemberDraw === "boolean") {
      runtime.whiteboardMemberDraw = payload.whiteboardMemberDraw;
    }
    persistRoomPluginState(runtime);
    emitState(roomId);
    emitWhiteboardState(roomId);
    ack?.({
      ok: true,
      allowMemberPluginToggle: runtime.allowMemberPluginToggle,
      whiteboardMemberDraw: runtime.whiteboardMemberDraw
    });
  });

  socket.on("setSong", input => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.youtube) return;
    const id = extractYouTubeId(String(input || ""));
    if (!id) return socket.emit("errorMessage", "Please enter a valid YouTube URL.");
    runtime.videoId = id;
    runtime.playing = true;
    runtime.position = 0;
    runtime.updatedAt = Date.now();
    runtime.changedBy = socket.user.username;
    emitState(roomId);
  });

  socket.on("addToQueue", input => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.youtube) return;
    const id = extractYouTubeId(String(input || ""));
    if (!id) return socket.emit("errorMessage", "Please enter a valid YouTube URL.");
    runtime.queue.push({
      videoId: id,
      addedBy: socket.user.username,
      id: crypto.randomUUID()
    });
    emitState(roomId);
  });

  socket.on("removeFromQueue", id => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.youtube) return;
    runtime.queue = runtime.queue.filter(item => item.id !== id);
    emitState(roomId);
  });

  socket.on("play", position => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.youtube || !runtime.videoId) return;
    runtime.position = Math.max(0, Number(position) || 0);
    runtime.playing = true;
    runtime.updatedAt = Date.now();
    runtime.changedBy = socket.user.username;
    emitState(roomId);
  });

  socket.on("pause", position => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.youtube || !runtime.videoId) return;
    runtime.position = Math.max(0, Number(position) || 0);
    runtime.playing = false;
    runtime.updatedAt = Date.now();
    runtime.changedBy = socket.user.username;
    emitState(roomId);
  });

  socket.on("seek", position => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.youtube || !runtime.videoId) return;
    runtime.position = Math.max(0, Number(position) || 0);
    runtime.updatedAt = Date.now();
    runtime.changedBy = socket.user.username;
    emitState(roomId);
  });

  socket.on("next", () => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.youtube) return;
    startNext(roomId);
  });

  socket.on("ended", () => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (runtime.plugins.youtube && runtime.videoId) startNext(roomId);
  });

  socket.on("sendMessage", (input, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    let rawMessage = "";
    let rawReplyToId = null;
    let fallbackReplyUser = null;
    let fallbackReplyText = null;
    let messageType = "discussion";
    let targetPlatform = null;
    let mediaId = null;
    let clientId = null;

    if (typeof input === "object" && input !== null) {
      rawMessage = String(input.message ?? input.text ?? "");
      rawReplyToId = input.replyToId ?? input.reply_to_id ?? input.replyTo?.id ?? null;
      fallbackReplyUser = input.replyToUsername ?? input.replyTo?.username ?? null;
      fallbackReplyText = input.replyToMessage ?? input.replyTo?.message ?? null;
      if (["discussion", "prompt_suggestion", "media"].includes(String(input.messageType || ""))) {
        messageType = String(input.messageType);
      }
      if (["chatgpt", "claude", "gemini"].includes(String(input.targetPlatform || "").toLowerCase())) {
        targetPlatform = String(input.targetPlatform).toLowerCase();
      }
      mediaId = input.mediaId ? String(input.mediaId).trim() : null;
      clientId = input.clientId ? String(input.clientId) : null;
    } else {
      rawMessage = String(input || "");
    }

    if (clientId && isDuplicateClientEvent(runtime, clientId)) {
      ack?.({ ok: true, deduplicated: true });
      return;
    }

    let mediaRecord = null;
    if (mediaId) {
      mediaRecord = getMediaByIdStmt.get(mediaId);
      if (!mediaRecord || String(mediaRecord.room_id).toUpperCase() !== runtime.roomId.toUpperCase()) {
        ack?.({ ok: false, error: "Attached media file could not be verified for this room." });
        return;
      }
    }

    const message = rawMessage.trim().slice(0, 4000);
    if (!message && !mediaRecord) {
      ack?.({ ok: false, error: "Write a message or attach media before sending." });
      return;
    }
    if (mediaRecord && !message && messageType === "discussion") {
      messageType = "media";
    }

    let replyToId = null;
    let replyToUsername = null;
    let replyToMessage = null;

    if (rawReplyToId) {
      const original = getMessageByIdInRoomStmt.get(String(rawReplyToId), roomId);
      if (original) {
        replyToId = original.id;
        replyToUsername = original.username;
        replyToMessage = original.message;
      } else if (fallbackReplyUser && fallbackReplyText) {
        replyToId = String(rawReplyToId);
        replyToUsername = String(fallbackReplyUser).slice(0, 60);
        replyToMessage = String(fallbackReplyText).slice(0, 500);
      }
    }

    const row = {
      id: crypto.randomUUID(),
      roomId: runtime.roomId,
      userId: socket.user.id || null,
      username: socket.user.username,
      message,
      messageType,
      targetPlatform,
      mediaId: mediaRecord ? mediaRecord.id : null,
      media: mediaRecord
        ? {
            id: mediaRecord.id,
            originalName: mediaRecord.original_name,
            mimeType: mediaRecord.mime_type,
            mediaKind: mediaRecord.media_kind,
            fileSize: mediaRecord.file_size,
            uploaderUsername: mediaRecord.uploader_username,
            url: `/api/media/${encodeURIComponent(mediaRecord.id)}`
          }
        : null,
      reactions: {},
      createdAt: Date.now(),
      replyToId,
      replyToUsername,
      replyToMessage
    };

    try {
      saveChatMessageStmt.run(
        row.id,
        row.roomId,
        row.userId,
        row.username,
        row.message,
        row.messageType,
        row.targetPlatform,
        row.mediaId,
        "{}",
        row.createdAt,
        row.replyToId,
        row.replyToUsername,
        row.replyToMessage
      );
      const formatted = formatChatMessageRow(row);
      io.to(socketRoomKey(runtime.roomId)).emit("chatMessage", formatted);
      const preview = (row.message || (row.media ? `Shared ${row.media.mediaKind}` : "New message")).slice(0, 120);
      notifyRoomParticipants(runtime.roomId, socket.user.username, recipientName => {
        const isMention =
          row.message &&
          row.message.toLowerCase().includes(`@${String(recipientName).toLowerCase()}`);
        const isPrompt = row.messageType === "prompt_suggestion";
        return {
          type: isMention ? "chat_mention" : isPrompt ? "prompt_suggestion" : "chat_message",
          title: isMention
            ? `${socket.user.username} mentioned you`
            : isPrompt
            ? `New AI Prompt Suggestion`
            : `Message from ${socket.user.username}`,
          message: preview,
          targetType: "chat",
          targetId: row.id,
          meta: { messageType: row.messageType },
          dedupKey: `chat:${row.id}`
        };
      });
      ack?.({ ok: true, message: formatted });
    } catch (error) {
      console.error("Unable to save chat message", error);
      ack?.({ ok: false, error: "Your message could not be saved. Please try again." });
    }
  });

  socket.on("toggleReaction", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    const messageId = String(payload?.messageId || "");
    const emoji = String(payload?.emoji || "").trim().slice(0, 12);
    const allowedReactions = ["👍", "🔥", "💡", "✅", "❤️"];
    if (!messageId || !allowedReactions.includes(emoji)) {
      ack?.({ ok: false, error: "Invalid reaction." });
      return;
    }
    const existing = getMessageByIdInRoomStmt.get(messageId, runtime.roomId);
    if (!existing) {
      ack?.({ ok: false, error: "Message not found in this room." });
      return;
    }
    const reactions = safeJsonParse(existing.reactionsJson || "{}", {});
    const currentList = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    const idx = currentList.findIndex(
      name => String(name).toLowerCase() === socket.user.username.toLowerCase()
    );
    if (idx >= 0) {
      currentList.splice(idx, 1);
    } else {
      currentList.push(socket.user.username);
    }
    if (currentList.length) reactions[emoji] = currentList;
    else delete reactions[emoji];

    updateChatReactionsStmt.run(JSON.stringify(reactions), messageId, runtime.roomId);
    io.to(socketRoomKey(runtime.roomId)).emit("messageReactionUpdated", {
      messageId,
      reactions
    });
    ack?.({ ok: true, messageId, reactions });
  });

  socket.on("chat:deleteMessage", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({ ok: false, error: "Only the workspace owner or administrator can moderate discussion messages." });
      return;
    }
    const messageId = String(payload?.messageId || "");
    if (!messageId) return;
    deleteChatMessageByIdStmt.run(messageId, runtime.roomId);
    io.to(socketRoomKey(runtime.roomId)).emit("chatMessageDeleted", { messageId });
    ack?.({ ok: true, messageId });
  });

  socket.on("chat:clear", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({
        ok: false,
        error: `Only the Room Admin (${runtime.owner}) or Administrator can clear room chat.`
      });
      return;
    }
    clearRoomChatStmt.run(runtime.roomId);
    io.to(socketRoomKey(runtime.roomId)).emit("chatCleared", {
      roomId: runtime.roomId,
      actor: socket.user.username
    });
    io.to(socketRoomKey(runtime.roomId)).emit("chatHistory", []);
    ack?.({ ok: true, roomId: runtime.roomId });
  });

  /* ── Collaborative Multiplayer Whiteboard Events ────────────── */
  socket.on("whiteboard:cursor", payload => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    const cursor = {
      socketId: socket.id,
      username: socket.user.username,
      color: getCursorColorForUser(socket.user.username),
      x: Number(payload?.x) || 0,
      y: Number(payload?.y) || 0,
      tool: String(payload?.tool || "pen").slice(0, 24),
      updatedAt: Date.now()
    };
    runtime.whiteboardCursors.set(socket.id, cursor);
    socket.to(socketRoomKey(runtime.roomId)).emit("whiteboard:cursor", cursor);
  });

  socket.on("whiteboard:stroke:progress", payload => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.whiteboardMemberDraw && !isRoomOwnerOrAdmin(runtime, socket.user)) return;
    if (!payload || typeof payload !== "object") return;
    socket.to(socketRoomKey(runtime.roomId)).emit("whiteboard:stroke:progress", {
      ...payload,
      socketId: socket.id,
      username: socket.user.username
    });
  });

  socket.on("whiteboard:element:upsert", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.whiteboardMemberDraw && !isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({ ok: false, error: "Whiteboard drawing is restricted to the workspace owner." });
      return;
    }
    const el = payload?.element;
    if (!el || typeof el !== "object" || !el.id || !el.type) {
      ack?.({ ok: false, error: "Invalid whiteboard element." });
      return;
    }

    const pushUndo = payload?.pushUndo !== false;
    if (pushUndo) {
      runtime.whiteboardUndoStack.push(JSON.stringify(runtime.whiteboardElements));
      if (runtime.whiteboardUndoStack.length > 40) runtime.whiteboardUndoStack.shift();
      runtime.whiteboardRedoStack = [];
    }

    const cleanEl = {
      ...el,
      id: String(el.id).slice(0, 80),
      author: el.author || socket.user.username,
      updatedAt: Date.now()
    };

    const existingIdx = runtime.whiteboardElements.findIndex(item => item.id === cleanEl.id);
    if (existingIdx >= 0) {
      runtime.whiteboardElements[existingIdx] = cleanEl;
    } else {
      runtime.whiteboardElements.push(cleanEl);
    }

    persistWhiteboardDocument(runtime.roomId, runtime.whiteboardElements, socket.user.username);
    io.to(socketRoomKey(runtime.roomId)).emit("whiteboard:element:upserted", {
      element: cleanEl,
      actor: socket.user.username
    });
    const wbWindow = Math.floor(Date.now() / 60000);
    notifyRoomParticipants(
      runtime.roomId,
      socket.user.username,
      () => ({
        type: "whiteboard_update",
        title: "Whiteboard Updated",
        message: `${socket.user.username} added or edited elements on the room whiteboard.`,
        targetType: "whiteboard",
        targetId: runtime.roomId,
        dedupKey: `wb:${runtime.roomId}:${socket.user.username}:${wbWindow}`
      }),
      true
    );
    ack?.({ ok: true, element: cleanEl });
  });

  socket.on("whiteboard:element:delete", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.whiteboardMemberDraw && !isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({ ok: false, error: "Whiteboard editing is restricted to the workspace owner." });
      return;
    }
    const ids = Array.isArray(payload?.ids)
      ? payload.ids.map(String)
      : payload?.id
      ? [String(payload.id)]
      : [];
    if (!ids.length) {
      ack?.({ ok: false, error: "No element specified." });
      return;
    }
    const idSet = new Set(ids);
    const beforeLen = runtime.whiteboardElements.length;
    const nextElements = runtime.whiteboardElements.filter(el => !idSet.has(el.id));
    if (nextElements.length !== beforeLen) {
      runtime.whiteboardUndoStack.push(JSON.stringify(runtime.whiteboardElements));
      if (runtime.whiteboardUndoStack.length > 40) runtime.whiteboardUndoStack.shift();
      runtime.whiteboardRedoStack = [];
      runtime.whiteboardElements = nextElements;
      persistWhiteboardDocument(runtime.roomId, runtime.whiteboardElements, socket.user.username);
      io.to(socketRoomKey(runtime.roomId)).emit("whiteboard:element:deleted", {
        ids,
        actor: socket.user.username
      });
    }
    ack?.({ ok: true, ids });
  });

  socket.on("whiteboard:undo", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.whiteboardMemberDraw && !isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({ ok: false, error: "Whiteboard editing is restricted." });
      return;
    }
    if (!runtime.whiteboardUndoStack.length) {
      ack?.({ ok: false, error: "Nothing to undo." });
      return;
    }
    runtime.whiteboardRedoStack.push(JSON.stringify(runtime.whiteboardElements));
    runtime.whiteboardElements = safeJsonParse(runtime.whiteboardUndoStack.pop(), []);
    persistWhiteboardDocument(runtime.roomId, runtime.whiteboardElements, socket.user.username);
    emitWhiteboardState(roomId);
    ack?.({ ok: true });
  });

  socket.on("whiteboard:redo", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.whiteboardMemberDraw && !isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({ ok: false, error: "Whiteboard editing is restricted." });
      return;
    }
    if (!runtime.whiteboardRedoStack.length) {
      ack?.({ ok: false, error: "Nothing to redo." });
      return;
    }
    runtime.whiteboardUndoStack.push(JSON.stringify(runtime.whiteboardElements));
    runtime.whiteboardElements = safeJsonParse(runtime.whiteboardRedoStack.pop(), []);
    persistWhiteboardDocument(runtime.roomId, runtime.whiteboardElements, socket.user.username);
    emitWhiteboardState(roomId);
    ack?.({ ok: true });
  });

  socket.on("whiteboard:clear", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.whiteboardMemberDraw && !isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({
        ok: false,
        error: `Only the workspace owner (${runtime.owner}) or administrator can clear the whiteboard while drawing is restricted.`
      });
      return;
    }
    if (runtime.whiteboardElements.length) {
      runtime.whiteboardUndoStack.push(JSON.stringify(runtime.whiteboardElements));
      if (runtime.whiteboardUndoStack.length > 40) runtime.whiteboardUndoStack.shift();
      runtime.whiteboardRedoStack = [];
    }
    runtime.whiteboardElements = [];
    persistWhiteboardDocument(runtime.roomId, [], socket.user.username);
    emitWhiteboardState(roomId);
    ack?.({ ok: true });
  });

  /* ── Multiplayer Games Lounge Socket Events ───────────────── */
  socket.on("games:getState", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const statePayload = getRoomGamesStatePayload(roomId);
    socket.emit("games:lobbyState", statePayload);
    ack?.({ ok: true, ...statePayload });
  });

  socket.on("games:createMatch", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);

    if (!runtime.plugins.games) {
      ack?.({
        ok: false,
        error: `Multiplayer Games Lounge is disabled. Ask the Room Admin (${runtime.owner}) to enable it first.`
      });
      return;
    }

    const gameType = String(payload?.gameType || "").toLowerCase();
    if (!["chess", "ludo", "tictactoe"].includes(gameType)) {
      ack?.({ ok: false, error: "Unsupported game type." });
      return;
    }

    const rawOptions = typeof payload?.options === "object" && payload.options !== null ? payload.options : {};
    const options =
      gameType === "chess"
        ? { timeMinutes: [5, 10, 15].includes(Number(rawOptions.timeMinutes)) ? Number(rawOptions.timeMinutes) : 10 }
        : gameType === "ludo"
        ? { maxPlayers: [2, 3, 4].includes(Number(rawOptions.maxPlayers)) ? Number(rawOptions.maxPlayers) : 4 }
        : {};

    const matchId = crypto.randomUUID();
    const now = Date.now();
    const players = [socket.user.username];

    insertGameMatchStmt.run(
      matchId,
      runtime.roomId,
      gameType,
      "waiting",
      socket.user.username,
      JSON.stringify(players),
      "[]",
      JSON.stringify(options),
      "null",
      null,
      now,
      now
    );

    const inviteUsernames = Array.isArray(payload?.inviteUsernames)
      ? payload.inviteUsernames.map(u => String(u || "").trim()).filter(Boolean)
      : payload?.inviteUsername
      ? [String(payload.inviteUsername).trim()]
      : [];

    for (const targetName of inviteUsernames) {
      if (targetName.toLowerCase() === socket.user.username.toLowerCase()) continue;
      const inviteId = crypto.randomUUID();
      insertGameInviteStmt.run(
        inviteId,
        runtime.roomId,
        matchId,
        gameType,
        socket.user.username,
        targetName,
        "pending",
        now,
        now
      );
      emitToRoomUser(runtime.roomId, targetName, "games:inviteReceived", {
        id: inviteId,
        roomId: runtime.roomId,
        matchId,
        gameType,
        fromUsername: socket.user.username,
        toUsername: targetName,
        status: "pending",
        createdAt: now
      });
      createUserNotification({
        roomId: runtime.roomId,
        recipientUsername: targetName,
        type: "game_invite",
        title: "New Game Invitation",
        message: `${socket.user.username} invited you to play ${getGameTitleLabel(gameType)}.`,
        targetType: "games_match",
        targetId: matchId,
        meta: { inviteId, gameType, fromUsername: socket.user.username },
        dedupKey: `invite:${inviteId}`
      });
    }

    const createdRow = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    const formatted = formatGameMatchRow(createdRow);
    emitGamesLobbyState(runtime.roomId);
    emitMatchUpdated(formatted);
    ack?.({ ok: true, match: formatted });
  });

  socket.on("games:invitePlayer", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.games) {
      ack?.({ ok: false, error: "Games Lounge is disabled." });
      return;
    }

    const matchId = String(payload?.matchId || "");
    const targetUsername = String(payload?.targetUsername || "").trim();
    if (!matchId || !targetUsername) {
      ack?.({ ok: false, error: "Match and target player are required." });
      return;
    }
    if (targetUsername.toLowerCase() === socket.user.username.toLowerCase()) {
      ack?.({ ok: false, error: "You cannot invite yourself." });
      return;
    }

    const row = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    if (!row || row.status !== "waiting") {
      ack?.({ ok: false, error: "Match is not open for invitations." });
      return;
    }

    const now = Date.now();
    const inviteId = crypto.randomUUID();
    const invitePayload = {
      id: inviteId,
      roomId: runtime.roomId,
      matchId: row.id,
      gameType: row.game_type,
      fromUsername: socket.user.username,
      toUsername: targetUsername,
      status: "pending",
      createdAt: now
    };

    insertGameInviteStmt.run(
      inviteId,
      runtime.roomId,
      row.id,
      row.game_type,
      socket.user.username,
      targetUsername,
      "pending",
      now,
      now
    );

    emitToRoomUser(runtime.roomId, targetUsername, "games:inviteReceived", invitePayload);
    createUserNotification({
      roomId: runtime.roomId,
      recipientUsername: targetUsername,
      type: "game_invite",
      title: "New Game Invitation",
      message: `${socket.user.username} invited you to play ${getGameTitleLabel(row.game_type)}.`,
      targetType: "games_match",
      targetId: row.id,
      meta: { inviteId, gameType: row.game_type, fromUsername: socket.user.username },
      dedupKey: `invite:${inviteId}`
    });
    emitGamesLobbyState(runtime.roomId);
    ack?.({ ok: true, invite: invitePayload });
  });

  socket.on("games:respondInvite", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    const inviteId = String(payload?.inviteId || "");
    const accept = Boolean(payload?.accept);
    const inv = getGameInviteByIdStmt.get(inviteId, runtime.roomId);

    if (!inv || inv.status !== "pending") {
      ack?.({ ok: false, error: "Invitation is no longer active." });
      return;
    }
    if (inv.to_username.toLowerCase() !== socket.user.username.toLowerCase()) {
      ack?.({ ok: false, error: "This invitation is addressed to another player." });
      return;
    }

    const now = Date.now();
    updateGameInviteStatusStmt.run(accept ? "accepted" : "declined", now, inv.id, runtime.roomId);

    if (!accept) {
      emitToRoomUser(runtime.roomId, inv.from_username, "games:inviteDeclined", {
        inviteId: inv.id,
        matchId: inv.match_id,
        gameType: inv.game_type,
        byUsername: socket.user.username
      });
      createUserNotification({
        roomId: runtime.roomId,
        recipientUsername: inv.from_username,
        type: "game_invite_response",
        title: "Game Invitation Declined",
        message: `${socket.user.username} declined your ${getGameTitleLabel(inv.game_type)} invite.`,
        targetType: "games_match",
        targetId: inv.match_id,
        dedupKey: `inv_resp:${inv.id}`
      });
      emitGamesLobbyState(runtime.roomId);
      ack?.({ ok: true, accepted: false });
      return;
    }

    if (!runtime.plugins.games) {
      ack?.({ ok: false, error: "Games Lounge is currently disabled by the Room Admin." });
      return;
    }

    const row = getGameMatchByIdStmt.get(inv.match_id, runtime.roomId);
    if (!row || row.status !== "waiting") {
      emitGamesLobbyState(runtime.roomId);
      ack?.({ ok: false, error: "This match has already started or ended." });
      return;
    }

    const players = safeJsonParse(row.players_json, []);
    let spectators = safeJsonParse(row.spectators_json, []);
    const options = safeJsonParse(row.options_json, {});
    const maxPlayers = row.game_type === "ludo" ? Number(options.maxPlayers) || 4 : 2;

    if (!players.some(p => p.toLowerCase() === socket.user.username.toLowerCase())) {
      if (players.length >= maxPlayers) {
        ack?.({ ok: false, error: "This match is already full." });
        return;
      }
      players.push(socket.user.username);
    }
    spectators = spectators.filter(s => s.toLowerCase() !== socket.user.username.toLowerCase());

    let nextStatus = row.status;
    let nextState = safeJsonParse(row.state_json, null);
    if (players.length >= maxPlayers) {
      nextStatus = "active";
      nextState = initializeMatchState(row.game_type, players, options);
    }

    updateGameMatchStmt.run(
      nextStatus,
      JSON.stringify(players),
      JSON.stringify(spectators),
      JSON.stringify(options),
      JSON.stringify(nextState),
      null,
      now,
      row.id,
      runtime.roomId
    );

    const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
    createUserNotification({
      roomId: runtime.roomId,
      recipientUsername: inv.from_username,
      type: "game_invite_response",
      title: "Game Invitation Accepted",
      message: `${socket.user.username} accepted your ${getGameTitleLabel(inv.game_type)} invite.`,
      targetType: "games_match",
      targetId: row.id,
      dedupKey: `inv_resp:${inv.id}`
    });
    if (updated.status === "active") {
      notifyGameTurnOrCompletion(updated, socket.user.username);
    }
    emitGamesLobbyState(runtime.roomId);
    emitMatchUpdated(updated);
    ack?.({ ok: true, accepted: true, match: updated });
  });

  socket.on("games:joinMatch", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.games) {
      ack?.({ ok: false, error: "Games Lounge is disabled by the Room Admin." });
      return;
    }

    const matchId = String(payload?.matchId || "");
    const row = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    if (!row) {
      ack?.({ ok: false, error: "Match not found in this room." });
      return;
    }

    const players = safeJsonParse(row.players_json, []);
    let spectators = safeJsonParse(row.spectators_json, []);
    const options = safeJsonParse(row.options_json, {});
    const alreadyPlayer = players.some(p => p.toLowerCase() === socket.user.username.toLowerCase());

    if (alreadyPlayer) {
      const formatted = formatGameMatchRow(row);
      ack?.({ ok: true, match: formatted, role: "player" });
      return;
    }

    if (row.status !== "waiting") {
      ack?.({ ok: false, error: "Match already started. You can spectate instead." });
      return;
    }

    const maxPlayers = row.game_type === "ludo" ? Number(options.maxPlayers) || 4 : 2;
    if (players.length >= maxPlayers) {
      ack?.({ ok: false, error: "Match is already full." });
      return;
    }

    players.push(socket.user.username);
    spectators = spectators.filter(s => s.toLowerCase() !== socket.user.username.toLowerCase());

    let nextStatus = "waiting";
    let nextState = safeJsonParse(row.state_json, null);
    if (players.length >= maxPlayers) {
      nextStatus = "active";
      nextState = initializeMatchState(row.game_type, players, options);
    }

    updateGameMatchStmt.run(
      nextStatus,
      JSON.stringify(players),
      JSON.stringify(spectators),
      JSON.stringify(options),
      JSON.stringify(nextState),
      null,
      Date.now(),
      row.id,
      runtime.roomId
    );

    const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
    if (updated.status === "active") {
      notifyGameTurnOrCompletion(updated, socket.user.username);
    } else if (row.host_username && row.host_username.toLowerCase() !== socket.user.username.toLowerCase()) {
      createUserNotification({
        roomId: runtime.roomId,
        recipientUsername: row.host_username,
        type: "game_join",
        title: "Player Joined Match",
        message: `${socket.user.username} joined your ${getGameTitleLabel(row.game_type)} match.`,
        targetType: "games_match",
        targetId: row.id,
        dedupKey: `gjoin:${row.id}:${socket.user.username}`
      });
    }
    emitGamesLobbyState(runtime.roomId);
    emitMatchUpdated(updated);
    ack?.({ ok: true, match: updated, role: "player" });
  });

  socket.on("games:startMatch", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    const matchId = String(payload?.matchId || "");
    const row = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    if (!row || row.status !== "waiting") {
      ack?.({ ok: false, error: "Match is not in waiting state." });
      return;
    }

    const isHost = row.host_username.toLowerCase() === socket.user.username.toLowerCase();
    if (!isHost && !isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({ ok: false, error: "Only the match host or Room Admin can start early." });
      return;
    }

    const players = safeJsonParse(row.players_json, []);
    if (players.length < 2) {
      ack?.({ ok: false, error: "At least 2 players are needed to start." });
      return;
    }

    const options = safeJsonParse(row.options_json, {});
    const spectators = safeJsonParse(row.spectators_json, []);
    const nextState = initializeMatchState(row.game_type, players, options);

    updateGameMatchStmt.run(
      "active",
      JSON.stringify(players),
      JSON.stringify(spectators),
      JSON.stringify(options),
      JSON.stringify(nextState),
      null,
      Date.now(),
      row.id,
      runtime.roomId
    );

    const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
    notifyGameTurnOrCompletion(updated, socket.user.username);
    emitGamesLobbyState(runtime.roomId);
    emitMatchUpdated(updated);
    ack?.({ ok: true, match: updated });
  });

  socket.on("games:spectateMatch", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.games) {
      ack?.({ ok: false, error: "Games Lounge is disabled." });
      return;
    }
    const matchId = String(payload?.matchId || "");
    const row = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    if (!row) {
      ack?.({ ok: false, error: "Match not found." });
      return;
    }

    const players = safeJsonParse(row.players_json, []);
    const spectators = safeJsonParse(row.spectators_json, []);
    const options = safeJsonParse(row.options_json, {});
    const state = safeJsonParse(row.state_json, null);

    const isPlayer = players.some(p => p.toLowerCase() === socket.user.username.toLowerCase());
    if (!isPlayer && !spectators.some(s => s.toLowerCase() === socket.user.username.toLowerCase())) {
      spectators.push(socket.user.username);
      updateGameMatchStmt.run(
        row.status,
        JSON.stringify(players),
        JSON.stringify(spectators),
        JSON.stringify(options),
        JSON.stringify(state),
        row.winner || null,
        Date.now(),
        row.id,
        runtime.roomId
      );
    }

    const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
    emitGamesLobbyState(runtime.roomId);
    emitMatchUpdated(updated);
    ack?.({ ok: true, match: updated, role: isPlayer ? "player" : "spectator" });
  });

  socket.on("games:leaveMatch", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    const matchId = String(payload?.matchId || "");
    const row = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    if (!row) {
      ack?.({ ok: false, error: "Match not found." });
      return;
    }

    let players = safeJsonParse(row.players_json, []);
    let spectators = safeJsonParse(row.spectators_json, []);
    const options = safeJsonParse(row.options_json, {});
    let state = safeJsonParse(row.state_json, null);
    const unameLower = socket.user.username.toLowerCase();

    if (spectators.some(s => s.toLowerCase() === unameLower)) {
      spectators = spectators.filter(s => s.toLowerCase() !== unameLower);
      updateGameMatchStmt.run(
        row.status,
        JSON.stringify(players),
        JSON.stringify(spectators),
        JSON.stringify(options),
        JSON.stringify(state),
        row.winner || null,
        Date.now(),
        row.id,
        runtime.roomId
      );
      const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
      emitGamesLobbyState(runtime.roomId);
      emitMatchUpdated(updated);
      ack?.({ ok: true, match: updated });
      return;
    }

    const isPlayer = players.some(p => p.toLowerCase() === unameLower);
    if (!isPlayer) {
      ack?.({ ok: true });
      return;
    }

    if (row.status === "waiting") {
      players = players.filter(p => p.toLowerCase() !== unameLower);
      const nextStatus = players.length === 0 ? "cancelled" : "waiting";
      updateGameMatchStmt.run(
        nextStatus,
        JSON.stringify(players),
        JSON.stringify(spectators),
        JSON.stringify(options),
        JSON.stringify(state),
        null,
        Date.now(),
        row.id,
        runtime.roomId
      );
    } else if (row.status === "active") {
      const remaining = players.filter(p => p.toLowerCase() !== unameLower);
      const winner = remaining[0] || null;
      if (state) {
        state.status = "completed";
        state.winner = winner;
        state.winnerUsername = winner;
        state.reason = `${socket.user.username} left the match`;
      }
      updateGameMatchStmt.run(
        "completed",
        JSON.stringify(players),
        JSON.stringify(spectators),
        JSON.stringify(options),
        JSON.stringify(state),
        winner,
        Date.now(),
        row.id,
        runtime.roomId
      );
    }

    const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
    if (updated.status === "completed") {
      notifyGameTurnOrCompletion(updated, socket.user.username);
    }
    emitGamesLobbyState(runtime.roomId);
    emitMatchUpdated(updated);
    ack?.({ ok: true, match: updated });
  });

  socket.on("games:makeMove", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    const matchId = String(payload?.matchId || "");
    const row = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    if (!row) {
      ack?.({ ok: false, error: "Match not found." });
      return;
    }
    if (row.status !== "active") {
      ack?.({ ok: false, error: "Match is not active." });
      return;
    }

    const players = safeJsonParse(row.players_json, []);
    const spectators = safeJsonParse(row.spectators_json, []);
    const options = safeJsonParse(row.options_json, {});
    const state = safeJsonParse(row.state_json, null);

    const isPlayer = players.some(p => p.toLowerCase() === socket.user.username.toLowerCase());
    if (!isPlayer) {
      ack?.({ ok: false, error: "Spectators cannot make moves." });
      return;
    }

    let result;
    if (row.game_type === "tictactoe") {
      result = tttEngine.applyMove(state, socket.user.username, payload?.move ?? payload);
    } else if (row.game_type === "chess") {
      result = chessEngine.applyMove(state, socket.user.username, payload?.move ?? payload);
    } else if (row.game_type === "ludo") {
      result = ludoEngine.moveToken(state, socket.user.username, payload?.move ?? payload);
    } else {
      ack?.({ ok: false, error: "Unknown game engine." });
      return;
    }

    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    const nextStatus = result.completed ? "completed" : "active";
    const winner = result.completed ? result.winner || result.state.winner || null : null;

    updateGameMatchStmt.run(
      nextStatus,
      JSON.stringify(players),
      JSON.stringify(spectators),
      JSON.stringify(options),
      JSON.stringify(result.state),
      winner,
      Date.now(),
      row.id,
      runtime.roomId
    );

    const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
    notifyGameTurnOrCompletion(updated, socket.user.username);
    emitMatchUpdated(updated);
    if (result.completed) {
      emitGamesLobbyState(runtime.roomId);
    }
    ack?.({ ok: true, match: updated });
  });

  socket.on("games:ludoRoll", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    const matchId = String(payload?.matchId || "");
    const row = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    if (!row || row.game_type !== "ludo" || row.status !== "active") {
      ack?.({ ok: false, error: "Active Ludo match not found." });
      return;
    }

    const players = safeJsonParse(row.players_json, []);
    const spectators = safeJsonParse(row.spectators_json, []);
    const options = safeJsonParse(row.options_json, {});
    const state = safeJsonParse(row.state_json, null);

    if (!players.some(p => p.toLowerCase() === socket.user.username.toLowerCase())) {
      ack?.({ ok: false, error: "Spectators cannot roll dice." });
      return;
    }

    const result = ludoEngine.rollDice(state, socket.user.username);
    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    updateGameMatchStmt.run(
      row.status,
      JSON.stringify(players),
      JSON.stringify(spectators),
      JSON.stringify(options),
      JSON.stringify(result.state),
      row.winner || null,
      Date.now(),
      row.id,
      runtime.roomId
    );

    const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
    if (result.autoPassed) {
      notifyGameTurnOrCompletion(updated, socket.user.username);
    }
    emitMatchUpdated(updated);
    ack?.({ ok: true, dice: result.dice, match: updated });
  });

  socket.on("games:chessAction", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    const matchId = String(payload?.matchId || "");
    const action = String(payload?.action || "");
    const row = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    if (!row || row.game_type !== "chess") {
      ack?.({ ok: false, error: "Chess match not found." });
      return;
    }

    const players = safeJsonParse(row.players_json, []);
    const spectators = safeJsonParse(row.spectators_json, []);
    const options = safeJsonParse(row.options_json, {});
    const state = safeJsonParse(row.state_json, null);

    const result = chessEngine.handleAction(state, socket.user.username, action, payload?.payload || payload);
    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    const nextStatus = result.completed ? "completed" : "active";
    const winner = result.completed ? result.winner || result.state.winner || null : null;

    updateGameMatchStmt.run(
      nextStatus,
      JSON.stringify(players),
      JSON.stringify(spectators),
      JSON.stringify(options),
      JSON.stringify(result.state),
      winner,
      Date.now(),
      row.id,
      runtime.roomId
    );

    const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
    if (result.completed) {
      notifyGameTurnOrCompletion(updated, socket.user.username);
    }
    emitMatchUpdated(updated);
    if (result.completed) {
      emitGamesLobbyState(runtime.roomId);
    }
    ack?.({ ok: true, match: updated });
  });

  socket.on("games:rematch", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!runtime.plugins.games) {
      ack?.({ ok: false, error: "Games Lounge is disabled by the Room Admin." });
      return;
    }
    const matchId = String(payload?.matchId || "");
    const row = getGameMatchByIdStmt.get(matchId, runtime.roomId);
    if (!row) {
      ack?.({ ok: false, error: "Match not found." });
      return;
    }

    const players = safeJsonParse(row.players_json, []);
    const spectators = safeJsonParse(row.spectators_json, []);
    const options = safeJsonParse(row.options_json, {});
    const prevState = safeJsonParse(row.state_json, null);

    if (!players.some(p => p.toLowerCase() === socket.user.username.toLowerCase())) {
      ack?.({ ok: false, error: "Only players in the match can start a rematch." });
      return;
    }

    let nextState;
    if (row.game_type === "tictactoe") {
      nextState = tttEngine.resetForRematch(prevState, players);
    } else if (row.game_type === "chess") {
      nextState = chessEngine.resetForRematch(prevState, players, options);
    } else if (row.game_type === "ludo") {
      nextState = ludoEngine.resetForRematch(prevState, players);
    } else {
      ack?.({ ok: false, error: "Unsupported game type." });
      return;
    }

    updateGameMatchStmt.run(
      "active",
      JSON.stringify(players),
      JSON.stringify(spectators),
      JSON.stringify(options),
      JSON.stringify(nextState),
      null,
      Date.now(),
      row.id,
      runtime.roomId
    );

    const updated = formatGameMatchRow(getGameMatchByIdStmt.get(row.id, runtime.roomId));
    notifyGameTurnOrCompletion(updated, socket.user.username);
    emitGamesLobbyState(runtime.roomId);
    emitMatchUpdated(updated);
    ack?.({ ok: true, match: updated });
  });

  socket.on("games:clear", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({
        ok: false,
        error: `Only the Room Admin (${runtime.owner}) or Administrator can clear the Games Lounge.`
      });
      return;
    }
    try {
      db.prepare("DELETE FROM game_invitations WHERE UPPER(room_id) = UPPER(?)").run(runtime.roomId);
      db.prepare("DELETE FROM game_matches WHERE UPPER(room_id) = UPPER(?)").run(runtime.roomId);
      emitGamesLobbyState(runtime.roomId);
      ack?.({ ok: true, roomId: runtime.roomId });
    } catch (error) {
      console.error("Unable to clear games lounge", error);
      ack?.({ ok: false, error: "Unable to clear Games Lounge right now." });
    }
  });

  /* ── Real-Time Notifications Events ──────────────────────── */
  socket.on("notifications:get", (payload, ack) => {
    const state = getUserNotificationsPayload(socket.user.username);
    socket.emit("notifications:state", state);
    ack?.({ ok: true, ...state });
  });

  socket.on("notifications:markRead", (payload, ack) => {
    const id = String(payload?.id || "").trim();
    if (id) {
      markNotificationReadStmt.run(id, socket.user.username);
    }
    const state = getUserNotificationsPayload(socket.user.username);
    emitToUsernameAcrossAllSockets(socket.user.username, "notifications:state", state);
    ack?.({ ok: true, ...state });
  });

  socket.on("notifications:markAllRead", (payload, ack) => {
    markAllNotificationsReadStmt.run(socket.user.username);
    const state = getUserNotificationsPayload(socket.user.username);
    emitToUsernameAcrossAllSockets(socket.user.username, "notifications:state", state);
    ack?.({ ok: true, ...state });
  });

  /* ── Real-Time WebRTC Voice Rooms Signaling & Channels ──────── */
  function validateVoiceSignalTarget(senderSocket, targetSocketId) {
    const cv = senderSocket.currentVoice;
    if (!cv || !cv.roomId || !cv.channelId) return null;
    const tid = String(targetSocketId || "");
    if (!tid || tid === senderSocket.id) return null;
    const target = io.sockets.sockets.get(tid);
    if (!target || !target.currentVoice) return null;
    if (
      String(target.currentVoice.roomId).toUpperCase() !== String(cv.roomId).toUpperCase() ||
      target.currentVoice.channelId !== cv.channelId
    ) {
      return null;
    }
    const runtime = getRoomRuntime(cv.roomId);
    const pMap = runtime.voiceParticipants.get(cv.channelId);
    if (!pMap || !pMap.has(senderSocket.id) || !pMap.has(tid)) return null;
    return target;
  }

  socket.on("voice:getChannels", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    if (!isUserMemberOfRoom(roomId, socket.user)) {
      ack?.({ ok: false, error: "Not authorized for this room." });
      return;
    }
    const voicePayload = buildRoomVoicePayload(roomId);
    socket.emit("voice:channelsUpdated", voicePayload);
    ack?.({ ok: true, ...voicePayload });
  });

  socket.on("voice:createChannel", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!isUserMemberOfRoom(runtime.roomId, socket.user)) {
      ack?.({ ok: false, error: "You must be a member of this room to create a voice channel." });
      return;
    }
    const name = String(payload?.name || "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (name.length < 2) {
      ack?.({ ok: false, error: "Voice channel name must be at least 2 characters." });
      return;
    }
    ensureRoomVoiceChannels(runtime.roomId);
    const existingAll = getRoomVoiceChannelsStmt.all(runtime.roomId);
    if (existingAll.length >= 12) {
      ack?.({ ok: false, error: "Maximum of 12 voice channels reached for this room." });
      return;
    }
    const dup = getVoiceChannelByNameStmt.get(runtime.roomId, name);
    if (dup) {
      ack?.({ ok: false, error: `Voice channel "${dup.name}" already exists in this room.` });
      return;
    }
    const channelId = `vc-${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();
    insertVoiceChannelStmt.run(channelId, runtime.roomId, name, socket.user.username, 0, now);
    const created = getVoiceChannelByIdStmt.get(channelId, runtime.roomId);
    emitVoiceChannelsState(runtime.roomId);
    ack?.({
      ok: true,
      channel: {
        id: created.id,
        roomId: runtime.roomId,
        name: created.name,
        createdBy: created.created_by,
        isDefault: false,
        createdAt: created.created_at,
        participants: []
      }
    });
  });

  socket.on("voice:deleteChannel", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!isUserMemberOfRoom(runtime.roomId, socket.user)) {
      ack?.({ ok: false, error: "Not authorized for this room." });
      return;
    }
    const channelId = String(payload?.channelId || "").trim();
    const ch = getVoiceChannelByIdStmt.get(channelId, runtime.roomId);
    if (!ch) {
      ack?.({ ok: false, error: "Voice channel not found in this room." });
      return;
    }
    if (ch.is_default) {
      ack?.({ ok: false, error: "The default General Voice channel cannot be deleted." });
      return;
    }
    const isCreator = ch.created_by.toLowerCase() === socket.user.username.toLowerCase();
    if (!isCreator && !isRoomOwnerOrAdmin(runtime, socket.user)) {
      ack?.({ ok: false, error: "Only the channel creator or Room Admin can remove this voice channel." });
      return;
    }

    const pMap = runtime.voiceParticipants.get(ch.id);
    if (pMap) {
      for (const sid of Array.from(pMap.keys())) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          leaveCurrentVoiceChannel(s);
          s.emit("voice:channelClosed", { channelId: ch.id, name: ch.name, by: socket.user.username });
        }
      }
      runtime.voiceParticipants.delete(ch.id);
    }
    deleteVoiceChannelByIdStmt.run(ch.id, runtime.roomId);
    emitVoiceChannelsState(runtime.roomId);
    ack?.({ ok: true, channelId: ch.id });
  });

  socket.on("voice:join", (payload, ack) => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    const runtime = getRoomRuntime(roomId);
    if (!isUserMemberOfRoom(runtime.roomId, socket.user)) {
      ack?.({ ok: false, error: "Unauthorized: you are not a member of this room." });
      return;
    }

    const channels = ensureRoomVoiceChannels(runtime.roomId);
    const requestedId = String(payload?.channelId || "").trim();
    const targetChannel = requestedId
      ? channels.find(c => c.id === requestedId)
      : channels[0];

    if (!targetChannel) {
      ack?.({ ok: false, error: "Voice channel not found in this room." });
      return;
    }

    if (
      socket.currentVoice &&
      socket.currentVoice.roomId === runtime.roomId &&
      socket.currentVoice.channelId === targetChannel.id
    ) {
      const pMap = runtime.voiceParticipants.get(targetChannel.id) || new Map();
      const peers = Array.from(pMap.values()).filter(p => p.socketId !== socket.id);
      ack?.({ ok: true, channelId: targetChannel.id, channelName: targetChannel.name, peers });
      return;
    }

    leaveCurrentVoiceChannel(socket);

    if (!runtime.voiceParticipants.has(targetChannel.id)) {
      runtime.voiceParticipants.set(targetChannel.id, new Map());
    }
    const pMap = runtime.voiceParticipants.get(targetChannel.id);

    // Collect existing peers BEFORE inserting caller so caller initiates WebRTC offers cleanly
    const existingPeers = Array.from(pMap.values());

    const participant = {
      socketId: socket.id,
      username: socket.user.username,
      userId: socket.user.id || null,
      isAdmin: Boolean(socket.user.isAdmin),
      isOwner: isRoomOwnerOrAdmin(runtime, socket.user),
      muted: Boolean(payload?.muted),
      deafened: Boolean(payload?.deafened),
      speaking: false,
      joinedAt: Date.now()
    };

    pMap.set(socket.id, participant);
    socket.currentVoice = { roomId: runtime.roomId, channelId: targetChannel.id };

    for (const peer of existingPeers) {
      const peerSocket = io.sockets.sockets.get(peer.socketId);
      if (peerSocket) {
        peerSocket.emit("voice:peerJoined", {
          roomId: runtime.roomId,
          channelId: targetChannel.id,
          participant
        });
      }
    }

    emitVoiceChannelsState(runtime.roomId);
    ack?.({
      ok: true,
      roomId: runtime.roomId,
      channelId: targetChannel.id,
      channelName: targetChannel.name,
      participant,
      peers: existingPeers
    });
  });

  socket.on("voice:leave", (payload, ack) => {
    const left = leaveCurrentVoiceChannel(socket);
    ack?.({ ok: true, left });
  });

  socket.on("voice:state", (payload, ack) => {
    const cv = socket.currentVoice;
    if (!cv) {
      ack?.({ ok: false, error: "You are not currently in a voice channel." });
      return;
    }
    const runtime = getRoomRuntime(cv.roomId);
    const pMap = runtime.voiceParticipants.get(cv.channelId);
    const participant = pMap?.get(socket.id);
    if (!participant) {
      ack?.({ ok: false, error: "Voice session expired." });
      return;
    }
    if (typeof payload?.muted === "boolean") participant.muted = payload.muted;
    if (typeof payload?.deafened === "boolean") participant.deafened = payload.deafened;
    if (participant.muted || participant.deafened) participant.speaking = false;

    io.to(socketRoomKey(runtime.roomId)).emit("voice:participantStateUpdated", {
      roomId: runtime.roomId,
      channelId: cv.channelId,
      socketId: socket.id,
      muted: participant.muted,
      deafened: participant.deafened,
      speaking: participant.speaking
    });
    emitVoiceChannelsState(runtime.roomId);
    ack?.({ ok: true, participant });
  });

  socket.on("voice:speaking", payload => {
    const cv = socket.currentVoice;
    if (!cv) return;
    const runtime = getRoomRuntime(cv.roomId);
    const pMap = runtime.voiceParticipants.get(cv.channelId);
    const participant = pMap?.get(socket.id);
    if (!participant) return;
    const nextSpeaking = Boolean(payload?.speaking) && !participant.muted && !participant.deafened;
    if (participant.speaking === nextSpeaking) return;
    participant.speaking = nextSpeaking;
    io.to(socketRoomKey(runtime.roomId)).emit("voice:participantStateUpdated", {
      roomId: runtime.roomId,
      channelId: cv.channelId,
      socketId: socket.id,
      muted: participant.muted,
      deafened: participant.deafened,
      speaking: participant.speaking
    });
  });

  socket.on("voice:offer", (payload, ack) => {
    const target = validateVoiceSignalTarget(socket, payload?.targetSocketId);
    if (!target || !payload?.sdp) {
      ack?.({ ok: false, error: "Invalid voice offer target." });
      return;
    }
    target.emit("voice:offer", {
      fromSocketId: socket.id,
      fromUsername: socket.user.username,
      channelId: socket.currentVoice.channelId,
      sdp: payload.sdp
    });
    ack?.({ ok: true });
  });

  socket.on("voice:answer", (payload, ack) => {
    const target = validateVoiceSignalTarget(socket, payload?.targetSocketId);
    if (!target || !payload?.sdp) {
      ack?.({ ok: false, error: "Invalid voice answer target." });
      return;
    }
    target.emit("voice:answer", {
      fromSocketId: socket.id,
      fromUsername: socket.user.username,
      channelId: socket.currentVoice.channelId,
      sdp: payload.sdp
    });
    ack?.({ ok: true });
  });

  socket.on("voice:iceCandidate", (payload, ack) => {
    const target = validateVoiceSignalTarget(socket, payload?.targetSocketId);
    if (!target || !payload?.candidate) {
      ack?.({ ok: false, error: "Invalid ICE candidate target." });
      return;
    }
    target.emit("voice:iceCandidate", {
      fromSocketId: socket.id,
      channelId: socket.currentVoice.channelId,
      candidate: payload.candidate
    });
    ack?.({ ok: true });
  });

  socket.on("requestSync", () => {
    const roomId = socket.currentRoomId || DEFAULT_ROOM_ID;
    socket.emit("state", publicState(roomId));
    socket.emit("aiSessionState", getRoomAiCollaborationState(roomId));
    socket.emit("whiteboardState", getWhiteboardStatePayload(roomId));
    socket.emit("games:lobbyState", getRoomGamesStatePayload(roomId));
    socket.emit("notifications:state", getUserNotificationsPayload(socket.user.username));
    socket.emit("voice:channelsUpdated", buildRoomVoicePayload(roomId));
  });

  socket.on("disconnect", () => {
    leaveCurrentSocketRoom(socket);
  });
});

app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      error: `Uploaded file exceeds the maximum allowed size (${MAX_VIDEO_UPLOAD_MB} MB).`
    });
  }
  next(err);
});

app.get("/{*splat}", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
server.listen(PORT, "0.0.0.0", () => console.log(`SecureSphere running on port ${PORT}`));
