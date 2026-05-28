# Interview Collaboration Platform Production Plan

This project now has a room access-control foundation and safer real-time paths. The next production phases should keep the same rule: every room event must validate authenticated room membership before it is accepted.

## Architecture

- Frontend: React routes, authenticated API client, one STOMP client per room, separate topic subscriptions for chat, whiteboard, presence, admin requests, and video signaling.
- Backend: Spring Boot REST APIs for durable state, STOMP WebSocket controllers for real-time events, PostgreSQL for users, rooms, participants, and chat history.
- Room access: `RoomParticipant` stores `OWNER`, `PARTICIPANT`, `PENDING`, `APPROVED`, `REJECTED`, and `BLOCKED`. Room creators are automatically approved owners.
- Scaling target: replace the in-memory STOMP simple broker and whiteboard history with Redis-backed pub/sub and persisted room state before running multiple backend instances.

## Next Backend Upgrades

- Add Redis:
  - Use Redis pub/sub for cross-instance room events.
  - Store hot room presence, join request counters, and recent whiteboard snapshots with TTLs.
  - Keep PostgreSQL as the source of truth for rooms, participants, users, and chat history.
- Add rate limiting:
  - Limit auth attempts by IP and username.
  - Limit chat sends, whiteboard strokes, and signaling messages per user per room.
- Add observability:
  - Add Spring Boot Actuator, Prometheus metrics, structured JSON logs, and request IDs.
  - Track room size, STOMP sessions, message rate, dropped events, auth latency, and DB latency.
- Add deployment hardening:
  - Split frontend and backend environment configs.
  - Add CI checks for backend compile/tests and frontend lint/build.
  - Use Docker Compose for local PostgreSQL and Redis.

## Next Frontend Upgrades

- Virtualize long chat histories and participant lists for 100-200 person rooms.
- Move whiteboard state into a reducer or external store so remote strokes do not re-render the whole room shell.
- Add keyboard-accessible modal dialogs for admin approvals and room settings.
- Add light/dark theme tokens in Tailwind config instead of ad hoc color classes.
- Add skeleton states for dashboard room lists, auth forms, and room startup.

## Video Upgrade Path

Current peer-to-peer WebRTC is appropriate for small mock interviews. For 100-200 participant rooms, move video to an SFU such as LiveKit, mediasoup, Janus, or Twilio Video.

- Keep the existing STOMP signaling channel for small-room fallback.
- Use TURN credentials from a private provider, not public demo credentials, in production.
- Add ICE restart handling, reconnect states, device selection, active speaker detection, and server-side room admission checks.
- For large rooms, send audio/video through an SFU and keep WebSocket/STOMP for collaboration events only.

## Feature Roadmap

- Collaborative code editor: Monaco editor plus room-scoped document operations.
- Interview timer and roles: interviewer, candidate, observer, admin.
- Session recording: server-managed recording if using an SFU; store metadata in PostgreSQL and media in object storage.
- AI assistant: create a separate `assistant` module with resume parsing, question generation, and feedback jobs behind explicit user actions.
- Resume upload: direct-to-object-storage upload, virus scan, then async question generation.
- Notifications: store durable notifications in PostgreSQL and publish live updates over `/user/queue/notifications`.
