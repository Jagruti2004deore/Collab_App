# CollabApp — Real-Time Collaboration Platform

> A full-stack platform where developers can collaborate in real time — combining video calling, live chat, a shared whiteboard, collaborative notes, and a live code editor in one authenticated workspace.

---

## Live Demo

| Layer | URL |
|---|---|
| Frontend | https://collab-app-jet.vercel.app/login |
| Backend API | https://collab-app-0edf.onrender.com |
 
> **Note:** The backend is hosted on Render's free tier. The first request after inactivity may take ~30 seconds due to a cold start.

---

## What is CollabApp?

CollabApp is a real-time collaboration platform built specifically for technical interview practice and pair programming. Two or more people join a room and get access to:

- **Video call** with screen sharing (WebRTC, peer-to-peer)
- **Live chat** with file sharing
- **Collaborative whiteboard** — draw together, see who drew what
- **Shared notes** — write together in real time
- **Live code editor** — type together with code execution (JavaScript, Python, Java, C, C++)
- **Room access control** — owner approves or rejects every join request

Everything is synced in real time via WebSocket. No page refresh needed.

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Java | 17 | Language |
| Spring Boot | 4.0.5 | Application framework |
| Spring Security | — | JWT authentication, filter chain |
| Spring WebSocket | — | STOMP message broker |
| Spring Data JPA | — | ORM, repository layer |
| Hibernate | — | SQL generation, schema management |
| PostgreSQL | — | Persistent database |
| HikariCP | — | Connection pooling |
| JJWT | 0.11.5 | JWT generation and validation |
| Lombok | — | Boilerplate reduction |
| Bean Validation | — | Request DTO validation |
| Java HttpClient | — | Code execution API calls |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 19.2.4 | UI library |
| Vite | — | Build tool and dev server |
| React Router DOM | 7.14.0 | Client-side routing |
| @stomp/stompjs | 7.3.0 | STOMP over WebSocket |
| SockJS Client | 1.6.1 | WebSocket fallback transport |
| Axios | 1.15.0 | HTTP client with interceptors |
| TailwindCSS | — | Utility-first styling |
| WebRTC (native) | — | Peer-to-peer video and screen sharing |

### Infrastructure
| Service | Purpose |
|---|---|
| Vercel | Frontend hosting (CDN, auto HTTPS) |
| Render | Backend hosting (Spring Boot JAR) |
| Render PostgreSQL | Managed database |
| Piston API (emkc.org) | Code execution engine |
| Google STUN | WebRTC NAT traversal |
| OpenRelay TURN | WebRTC relay for restricted networks |

---

## Features

### Authentication
- JWT-based stateless authentication (24-hour token)
- BCrypt password hashing (strength 10)
- Token sent via `Authorization: Bearer` header
- Auto logout on token expiry via Axios response interceptor
- Protected routes with loading-state guard (no flash of unauthenticated content)

### Room Access Control
- Owner creates a room — gets a UUID-based invite link
- Anyone with the link can request to join
- Owner receives a real-time notification (WebSocket) and approves, rejects, or blocks
- Pending users wait in a lobby; on approval the room UI opens automatically
- Every WebSocket and REST operation validates room membership via `room_participants` table

### Real-Time Chat
- Messages persisted to PostgreSQL
- Last 50 messages loaded on join
- File sharing (images inline, other files as download links)
- Typing indicator with debounce (1800ms)
- Online presence (join/leave/disconnect all handled)

### Collaborative Whiteboard
- Multi-user drawing with colour, brush size, and eraser
- Touch support for mobile and tablet
- Stroke throttled to 60fps to prevent WebSocket flooding
- "Who drew this" tooltip — hover any stroke to see the author
- Late joiners receive full canvas history (catch-up via personal WebSocket queue)
- Clear canvas broadcasts to all participants

### Collaborative Notes
- Shared plain-text notepad synced across all participants
- Debounced publish (350ms) — not every keystroke, just pauses
- Remote-update guard prevents echo loops
- Download as `.txt` file

### Live Code Editor
- Shared code synced across all participants in real time
- Languages: JavaScript, Python, Java, C++, C
- Code execution via Piston API — output shown in console panel
- Language switch resets to a starter template
- Download code as the correct file extension

### Video Calling
- Peer-to-peer WebRTC (no media server required for small rooms)
- Screen sharing with seamless track replacement (no call interruption)
- Active camera/mic toggle
- STUN + TURN for NAT traversal
- ICE candidate queuing — handles race conditions where candidates arrive before SDP

---

## Project Structure

```
CollabApp/
├── Backend/                          # Spring Boot application
│   └── src/main/java/com/collabapp/
│       ├── config/
│       │   ├── SecurityConfig.java          # JWT filter chain, CORS, CSRF, session policy
│       │   ├── WebConfig.java               # CORS config, ObjectMapper bean
│       │   ├── WebSocketConfig.java         # STOMP broker, endpoints, thread pools
│       │   ├── WebSocketAuthInterceptor.java # JWT validation on STOMP CONNECT
│       │   └── WebSocketEventListener.java  # Disconnect cleanup → presence update
│       ├── controller/
│       │   ├── AuthController.java          # POST /api/auth/register, /login, /me
│       │   ├── RoomController.java          # Room CRUD, join requests, approve/reject/block
│       │   ├── ChatController.java          # WebSocket chat, presence, typing, file upload
│       │   ├── SignalController.java        # WebRTC offer/answer/ICE relay
│       │   ├── WhiteboardController.java    # WebSocket whiteboard strokes + history
│       │   ├── NoteController.java          # WebSocket notes sync + history
│       │   ├── CodeController.java          # WebSocket code sync + history
│       │   └── CodeExecutionController.java # POST /api/rooms/{id}/code/execute
│       ├── service/
│       │   ├── AuthService.java             # Register, login, JWT issue
│       │   ├── RoomService.java             # Room CRUD, RBAC assertCanAccess
│       │   ├── ChatService.java             # Message persistence, history fetch
│       │   ├── RoomPresenceService.java     # In-memory presence (ConcurrentHashMap)
│       │   └── CodeExecutionService.java    # Piston API integration, version resolution
│       ├── security/
│       │   ├── JwtUtil.java                 # Token generation and validation (HMAC-SHA256)
│       │   ├── JwtAuthFilter.java           # OncePerRequestFilter → SecurityContext
│       │   └── UserDetailsServiceImpl.java  # Loads User entity for Spring Security
│       ├── entity/
│       │   ├── User.java                    # users table
│       │   ├── Room.java                    # rooms table (UUID roomId)
│       │   ├── RoomParticipant.java         # room_participants (Role + Status RBAC)
│       │   └── ChatMessage.java             # chat_messages table
│       ├── dto/                             # Request/response POJOs
│       └── repository/                      # Spring Data JPA interfaces
│
└── frontend/                         # React + Vite application
    └── src/
        ├── main.jsx                         # App entry point, React 18 createRoot
        ├── App.jsx                          # Router setup, AuthProvider wrap
        ├── api/
        │   └── axios.js                     # Axios instance, request/response interceptors
        ├── context/
        │   ├── AuthContext.js               # React context object
        │   ├── AuthProvider.jsx             # Auth state, login/logout/register
        │   └── useAuth.js                   # Custom hook
        ├── components/
        │   ├── ProtectedRoute.jsx           # Loading guard + redirect to /login
        │   ├── Chat.jsx                     # Chat UI, file upload, typing indicator
        │   ├── VideoCall.jsx                # WebRTC peer connections, screen share
        │   ├── Whiteboard.jsx               # Canvas, touch, stroke throttle, tooltip
        │   ├── Notes.jsx                    # Shared notepad, debounce, download
        │   ├── CodeEditor.jsx               # Code textarea, execution, language switch
        │   └── OnlineUsers.jsx              # Presence list
        └── pages/
            ├── LoginPage.jsx
            ├── RegisterPage.jsx
            ├── DashboardPage.jsx            # Room list, create, join by link
            └── RoomPage.jsx                 # WebSocket orchestration, tab layout
```

---

## Database Schema

```
users
├── id           BIGSERIAL PRIMARY KEY
├── username     VARCHAR UNIQUE NOT NULL  ← indexed
├── email        VARCHAR UNIQUE NOT NULL  ← indexed
├── password     VARCHAR NOT NULL         (BCrypt hash)
└── created_at   TIMESTAMP

rooms
├── id           BIGSERIAL PRIMARY KEY
├── room_id      VARCHAR UNIQUE NOT NULL  ← UUID, indexed (used in URLs)
├── name         VARCHAR NOT NULL
├── created_by   FK → users.id (EAGER)
└── created_at   TIMESTAMP

room_participants
├── id           BIGSERIAL PRIMARY KEY
├── room_id_fk   FK → rooms.id           ← composite index with status, with user
├── user_id_fk   FK → users.id
├── role         ENUM (OWNER, PARTICIPANT)
├── status       ENUM (PENDING, APPROVED, REJECTED, BLOCKED)
├── requested_at TIMESTAMP
└── UNIQUE (room_id_fk, user_id_fk)

chat_messages
├── id           BIGSERIAL PRIMARY KEY
├── room_id_fk   FK → rooms.id           ← indexed
├── sender_id    FK → users.id
├── content      TEXT
├── message_type ENUM (CHAT, FILE)
└── sent_at      TIMESTAMP
```

---

## WebSocket Destinations Reference

### Client → Server (`/app/...`)
| Destination | Payload | Description |
|---|---|---|
| `/app/chat/{roomId}` | `ChatMessageDTO` | Send a chat message |
| `/app/room/{roomId}/join` | `PresenceMessage` | Announce join |
| `/app/room/{roomId}/leave` | `PresenceMessage` | Announce leave |
| `/app/room/{roomId}/typing` | `PresenceMessage` | Typing indicator |
| `/app/signal/{roomId}` | `SignalMessage` | WebRTC offer/answer/ICE |
| `/app/whiteboard/{roomId}` | `WhiteboardMessage` | Draw stroke / clear / history request |
| `/app/notes/{roomId}` | `NoteMessage` | Update notes / history request |
| `/app/code/{roomId}` | `CodeMessage` | Update code / history request |

### Server → All Room Members (`/topic/...`)
| Destination | Description |
|---|---|
| `/topic/room/{roomId}` | Broadcast chat message |
| `/topic/room/{roomId}/presence` | Join / leave / typing events |
| `/topic/whiteboard/{roomId}` | Whiteboard stroke broadcast |
| `/topic/notes/{roomId}` | Notes update broadcast |
| `/topic/code/{roomId}` | Code update broadcast |

### Server → Specific User (`/user/queue/...`)
| Destination | Description |
|---|---|
| `/user/queue/room-access` | Owner's approve / reject / block decision |
| `/user/queue/room-requests` | New join request (to room owner) |
| `/user/queue/signal` | WebRTC signal (targeted to one peer) |
| `/user/queue/whiteboard-history` | Canvas replay for late joiner |
| `/user/queue/code-history` | Code state for late joiner |
| `/user/queue/notes-history` | Notes state for late joiner |

---

## REST API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Register and receive JWT |
| POST | `/api/auth/login` | None | Login and receive JWT |
| GET | `/api/auth/me` | JWT | Get current user info |

### Rooms
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/rooms` | JWT | Create a room |
| GET | `/api/rooms/my` | JWT | Rooms you created |
| GET | `/api/rooms/joined` | JWT | Rooms you joined |
| GET | `/api/rooms/{roomId}` | JWT | Get room details |
| POST | `/api/rooms/{roomId}/join-requests` | JWT | Request to join a room |
| GET | `/api/rooms/{roomId}/participants/pending` | JWT (owner) | List pending requests |
| POST | `/api/rooms/{roomId}/participants/{userId}/approve` | JWT (owner) | Approve request |
| POST | `/api/rooms/{roomId}/participants/{userId}/reject` | JWT (owner) | Reject request |
| POST | `/api/rooms/{roomId}/participants/{userId}/block` | JWT (owner) | Block user |

### Chat
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/chat/{roomId}/history` | JWT | Last 50 messages |
| POST | `/api/chat/{roomId}/files` | JWT | Upload a file |

### Code Execution
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/rooms/{roomId}/code/execute` | JWT | Run code (Piston API) |

---

## Local Setup

### Prerequisites
- Java 17+
- Maven 3.8+
- Node.js 18+
- PostgreSQL 14+

### 1. Clone the repository

```bash
git clone https://github.com/your-username/collabapp.git
cd collabapp
```

### 2. Set up the database

```sql
CREATE DATABASE collabapp;
CREATE USER collabuser WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE collabapp TO collabuser;
```

### 3. Configure the backend

Create a `.env` file or set these environment variables before running:

```bash
DATABASE_URL=jdbc:postgresql://localhost:5432/collabapp
DATABASE_USERNAME=collabuser
DATABASE_PASSWORD=yourpassword
JWT_SECRET=your-secret-key-must-be-at-least-32-characters-long
```

> **JWT_SECRET** must be at least 32 characters (256 bits) for HMAC-SHA256.

### 4. Run the backend

```bash
cd Backend
mvn spring-boot:run
```

The server starts at `http://localhost:8080`.  
Hibernate auto-creates all tables on first run (`ddl-auto=update`).

### 5. Configure the frontend

```bash
cd frontend
cp .env.example .env
```

Edit `.env`:
```
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=http://localhost:8080
```

### 6. Run the frontend

```bash
npm install
npm run dev
```

App opens at `http://localhost:5173`.

---

## Deployment

### Backend — Render

1. Push `Backend/` to a GitHub repository.
2. Create a new **Web Service** on Render, connected to the repo.
3. Set **Build Command**: `mvn clean package -DskipTests`
4. Set **Start Command**: `java -jar target/*.jar`
5. Add these environment variables in the Render dashboard:

```
DATABASE_URL          = (Render PostgreSQL internal URL)
DATABASE_USERNAME     = (from Render PostgreSQL)
DATABASE_PASSWORD     = (from Render PostgreSQL)
JWT_SECRET            = (generate: openssl rand -base64 32)
PORT                  = 8080
COMPILER_API_URL      = https://emkc.org/api/v2/piston
```

### Frontend — Vercel

1. Push `frontend/` to a GitHub repository.
2. Import the repository on Vercel.
3. Set **Framework Preset** to `Vite`.
4. Add environment variables:

```
VITE_API_BASE_URL     = https://your-backend.onrender.com
VITE_WS_URL           = https://your-backend.onrender.com
```

5. Deploy. Vercel handles HTTPS and CDN automatically.

---

## Environment Variables Reference

### Backend

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL JDBC URL |
| `DATABASE_USERNAME` | ✅ | — | DB username |
| `DATABASE_PASSWORD` | ✅ | — | DB password |
| `JWT_SECRET` | ✅ | — | HMAC-SHA256 signing key (min 32 chars) |
| `PORT` | — | `8080` | HTTP server port |
| `COMPILER_API_URL` | — | `https://emkc.org/api/v2/piston` | Piston-compatible code runner URL |
| `COMPILER_TIMEOUT_MS` | — | `8000` | Max execution time per run (ms) |
| `MAX_FILE_SIZE` | — | `8MB` | Max upload size per file |
| `DB_POOL_MAX` | — | `20` | HikariCP max connections |

### Frontend

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | ✅ | Backend REST API base URL |
| `VITE_WS_URL` | ✅ | Backend WebSocket URL (same as API URL) |

---

## Architecture Decisions

**Why JWT over sessions?**  
Stateless tokens let the backend scale horizontally without shared session storage. Every request carries its own credential — no database lookup needed for authentication.

**Why WebSocket + STOMP over polling?**  
Polling would require clients to ask "any new messages?" every few seconds, wasting bandwidth and adding latency. STOMP over WebSocket is event-driven — the server pushes only when something happens.

**Why UUID for room IDs?**  
Auto-increment integers are enumerable — an attacker guesses room 1, 2, 3. A 128-bit random UUID has 2¹²² possible values — statistically impossible to guess.

**Why in-memory state for whiteboard/notes/code?**  
Simpler to implement and fast enough for the current single-instance deployment. The known limitation is state loss on server restart. The production upgrade path is Redis for ephemeral state with TTLs.

**Why WebRTC mesh instead of an SFU?**  
Peer-to-peer is appropriate for 2–4 users (the typical interview use case) and requires no media server. For rooms larger than ~6 participants, an SFU like LiveKit would replace the mesh topology.

---

## Known Limitations & Roadmap

| Limitation | Status | Planned Fix |
|---|---|---|
| Whiteboard/notes/code state lost on server restart | Current | Redis persistence with TTL |
| Presence broken across multiple backend instances | Current | Redis Sets for shared presence |
| WebRTC mesh doesn't scale beyond ~6 users | By design | LiveKit SFU integration |
| Public Piston API may be rate-limited | Current | Self-hosted Piston instance |
| No JWT refresh tokens | Current | 15-min access + 7-day refresh token |
| Code editor is a plain textarea | Current | Monaco Editor integration |
| No collaborative conflict resolution (last-write-wins) | Current | Yjs CRDT library |

---

## Contributing

Pull requests are welcome.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please follow the existing code style. Backend: standard Java conventions with Lombok. Frontend: functional React components, hooks only, Tailwind for styling.

---

## Author

**Jagruti Vijay Deore (Anvi)**  
B.Tech Computer Science Engineering — Sandip University, Nashik (2026)  
[LinkedIn](https://linkedin.com/in/your-profile) · [GitHub](https://github.com/your-username)

---

## License

This project is licensed under the MIT License.

```
MIT License

Copyright (c) 2025 Jagruti Vijay Deore

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
