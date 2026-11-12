# HelpDesk — System Design

HelpDesk lets clients raise help requests and get a call back from a consultant. Calls are
video with screen sharing; with the client's consent they are recorded, and afterwards both
people get the recording, a transcript with speaker names, and a summary.

Each section below describes how a part works today, the trade-offs behind it, and how it
would change in production.

## 1. Overview

```
 Client app                                Consultant app
   │  ◄──────── WebRTC media (P2P) ────────►  │
   │  recorder (canvas + Web Audio)           │
   ├── REST ───────┐               ┌──────── REST
   └── WebSocket ──┤               ├──── WebSocket
                   ▼               ▼
                 ┌───────────────────┐
                 │    Backend API    │── Database
                 └─────────┬─────────┘
                           ├── Media storage ── ffmpeg
                           ├── Speech-to-text (Sarvam / Deepgram)
                           └── LLM summary (Gemini / Claude)
```

| Concern | Today | In production |
|---|---|---|
| Frontend | One Vue 3 portal, role-based | Separate client and consultant apps |
| Backend | One NestJS service | API, realtime gateway, media workers |
| Notifications | Socket.IO, single instance | Socket.IO with Redis adapter |
| Calls | WebRTC peer-to-peer, STUN | SFU + TURN |
| Recordings | Local disk | S3 + CDN signed URLs |
| Processing | In-process timers | Durable job queue + workers |
| Database | SQLite, schema sync | Postgres with migrations |

## 2. Frontend

**Today.** A single Vue 3 app (Composition API, Pinia, Vue Router, Vite) serves both roles.
After login the router sends clients to `/client` (home, support requests) and consultants to
`/consultant` (the request queue); each has its own shell and navigation, and the call room
(`/call/:id`) is shared.

- `api/` — typed REST client.
- `communication/` — the socket connection, the WebRTC peer, and the recorder.
- `stores/` — auth session, the active call, toasts.
- The session lives in `sessionStorage`, so it is per tab: a client and a consultant can be
  signed in side by side in one browser.

**Trade-offs.** One app is quicker to build and keeps shared pieces (call room, pre-call device
check, recording player) in one place. The cost is that both roles ship in the same bundle and
release together, and route guards are the only thing separating them in the UI (the API
enforces the real rules).

**In production.** Two apps — a client portal and a consultant console — with their own
release cycles, permissions and performance budgets, sharing a component library (call room,
player, design tokens) and a generated API client. Sessions move to short-lived access tokens
with an httpOnly refresh cookie.

## 3. Backend service

**Today.** One NestJS service, split into modules:

| Module | Responsibility |
|---|---|
| `auth` | Login, JWT guard, role guard |
| `users` | User entity, demo seed |
| `help-requests` | Create, list, resolve requests |
| `calls` | Call lifecycle, recording upload, post-call processing, playback links |
| `communication` | Socket.IO gateway and push helpers |

Main routes:

| Route | Who |
|---|---|
| `POST /auth/login` | anyone |
| `POST /help-requests`, `GET /help-requests` | client creates; both list (clients see their own) |
| `POST /help-requests/:id/resolve` | consultant |
| `POST /help-requests/:id/calls` | consultant starts a call |
| `POST /calls/:id/accept`, `decline`, `cancel`, `end` | participants, by role |
| `POST /calls/:id/recording/request`, `allow`, `decline`, `stop` | consultant asks, client consents |
| `POST /calls/:id/recording/chunks` | client uploads recording chunks |
| `POST /calls/:id/recording/link`, `GET /recordings/:token` | playback |
| `GET /calls/:id/transcript` | participants |

**Trade-offs.** A modular monolith keeps everything in one deploy with shared transactions,
which suits the current size. But the parts have very different load profiles: request CRUD
is light, the socket gateway holds long-lived connections, and post-call processing is CPU and
network heavy (ffmpeg, external APIs). In one process they compete for the same resources.

**In production.** Split along those lines:

- **API service** — auth, users, requests, call lifecycle. Stateless, scaled horizontally.
- **Realtime gateway** — WebSocket connections and signalling.
- **Media processing workers** — merge, transcription, summary; scaled on queue depth.
- **Notification service** (later) — email/push for missed calls and ready recordings.

Services communicate through a message broker (SQS/SNS or similar) for events such as
`call.ended` and `recording.ready`, rather than direct calls.

## 4. Data model

```
users 1───* help_requests 1───* calls 1───1 call_transcripts
  └──────────────────────────────┘ (client_id, consultant_id)
```

**users**

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | PK |
| `name`, `email` | text | email unique |
| `password_hash` | text | bcrypt, never selected by default |
| `role` | enum | `CLIENT` / `CONSULTANT` |
| `is_active` | bool | |
| `created_at`, `updated_at`, `deleted_at` | datetime | soft delete |

**help_requests**

| Column | Type | Notes |
|---|---|---|
| `request_id` | uuid | PK |
| `client_id` | uuid | FK users, indexed |
| `title`, `description` | text | |
| `status` | enum | `OPEN` / `IN_CALL` / `RESOLVED` |
| `created_at`, `updated_at`, `deleted_at` | datetime | |

**calls** — one row per call attempt, so a request keeps its full call history.

| Column | Type | Notes |
|---|---|---|
| `call_id` | uuid | PK |
| `request_id`, `client_id`, `consultant_id` | uuid | FKs, indexed |
| `status` | enum | see call lifecycle |
| `recording` | enum | `OFF` / `REQUESTED` / `ON` |
| `consent_at` | datetime | when the client allowed recording |
| `started_at`, `ended_at` | datetime | |
| `recording_path`, `recording_parts`, `recording_stopped_at` | | where chunks are stored, how many, late-chunk window |
| `recording_file` | text | merged file, once processed |
| `error` | text | user-facing reason when processing fails |

**call_transcripts** — one per call.

| Column | Type | Notes |
|---|---|---|
| `call_id` | uuid | PK and FK calls (cascade delete) |
| `provider`, `model` | text | which speech-to-text produced it |
| `segments` | json | `[{ speaker: CLIENT\|CONSULTANT, start, end, text }]`, seconds into the recording |
| `summary` | json | `{ kind: 'structured', problem, stepsTaken[], resolution, followUps[] }` or `{ kind: 'paragraph', text }` |
| `summary_provider`, `summary_model` | text | which LLM produced the summary |

**Trade-offs.**
- Transcripts are in their own table because they are large and only the review screen needs
  them; the request list loads every call row and shouldn't carry them.
- The summary sits with the transcript because it is derived from it — they are created and
  deleted together. A separate summaries table would only pay off with several summaries per call.
- Storing provider and model with every transcript and summary makes it possible to compare
  providers and re-run old calls later.
- SQLite with TypeORM `synchronize` means zero setup, but no migrations or concurrent writers.

**In production.** Postgres with versioned migrations. Transcript text indexed for search
(Postgres full-text or OpenSearch) so consultants can find past calls. Large transcripts could
move to object storage with only metadata in the database.

## 5. Request lifecycle

```
OPEN ──(call answered)──► IN_CALL ──(call ended)──► OPEN ──(consultant resolves)──► RESOLVED
```

- A client creates a request; it is `OPEN` and appears in the consultant queue instantly.
- Starting a call is refused if the request is resolved, already in a call, or already ringing.
- When a call is answered the request is `IN_CALL`; when it ends it returns to `OPEN`, so the
  consultant can call again or resolve it.
- Only a consultant can resolve, and not while a call is in progress.

## 6. Call lifecycle

```
RINGING ─► ACTIVE ─► ENDED ─► PROCESSING ─► READY
   │                              └───────► FAILED
   ├─► DECLINED   (client declines)
   ├─► MISSED     (no answer within 30 s, or cancelled)
```

Recording has its own small state machine inside an active call:

```
OFF ──(consultant asks)──► REQUESTED ──(client allows)──► ON
                              └──(client declines)──► OFF
ON ──(either side stops / call ends)──► OFF
```

- Every transition reads the current status inside a database transaction and returns 409 if
  it has moved on. Two racing actions — the client accepting as the call times out — can't both
  succeed.
- A call that ends without a recording stays `ENDED`. A recorded call moves to `PROCESSING`
  a few seconds later, then `READY` or `FAILED` (section 9).
- Ending the call ends it for both people. A leave/rejoin flow (reconnecting after a refresh)
  was left out: it multiplies states and edge cases for little value in a two-person call.

**In production.** The 30-second ring timeout and processing delays become scheduled jobs in
the queue rather than in-process timers, so they survive restarts and work across instances.

## 7. Real-time notifications (WebSockets)

**Today.** Socket.IO on the same server. The client authenticates with its JWT in the
handshake; each socket then joins rooms:

| Room | Members | Events |
|---|---|---|
| `consultants` | all consultants | `help-request.created`, `help-request.updated` |
| `user:<id>` | one user's tabs | updates to their own requests and calls (ringing, answered, recording state, processing status) |
| `call:<id>` | the two participants | `call.signal`, `call.peer-joined`, `call.peer-left` |

Events carry the updated object, so the UI replaces it in place instead of re-fetching or
polling. A socket can only join the room of an active call it belongs to.

**Trade-offs.** WebSockets give instant updates both ways and double as the WebRTC signalling
channel, at the cost of long-lived connections and state held in one process — rooms only
exist on the instance a user is connected to.

**In production.** The realtime gateway runs as its own service behind a load balancer with
sticky sessions and the Socket.IO Redis adapter, so an event published by any service reaches
users on any instance. Missed events are recovered by re-fetching on reconnect.

## 8. Calls — WebRTC

**Today.** Media flows browser to browser.

- Before joining, a pre-call screen shows a camera preview and mic level and lets the user pick
  devices; the same stream is handed to the call so there is no second permission prompt.
- The two browsers exchange SDP offers/answers and ICE candidates through the `call:<id>`
  socket room. Connectivity uses a public STUN server.
- Screen sharing has its own video transceiver, created with the call, so sharing starts and
  stops by swapping its track — no renegotiation.
- Mute and camera state, and who is speaking (from audio levels), are shown on both sides.

**Trade-offs.** Peer-to-peer is the simplest fit for two-person calls: no media servers, lowest
latency, no media cost. But the server never sees the media, so it cannot record it, and
without TURN some network pairs (symmetric NATs, strict firewalls) cannot connect.

**In production.** An SFU (LiveKit, mediasoup) plus TURN (coturn). This gives reliable
connectivity, room for more participants, quality adaptation, and server-side recording.

## 9. Recording and storage

**Today.**

1. **Consent.** The consultant asks; the client sees exactly what will be recorded (the shared
   screen and both voices) and allows or declines. Either side can stop it.
2. **Capture in the client's browser.** A hidden canvas draws the call — the shared screen with
   both camera tiles beside it, or the two tiles when nobody shares — including names and a
   green border on whoever is speaking. Drawing runs on a worker-driven timer so it keeps going
   when the tab is in the background.
3. **Stereo audio.** Web Audio mixes one stereo track: the client's mic on the left channel, the
   consultant's voice on the right. This separation is what names the speakers later.
4. **Upload during the call.** `MediaRecorder` emits a chunk every 5 seconds and each is
   uploaded immediately to `recordings/<callId>/part-N.webm`. A short grace period accepts
   chunks still in flight after recording stops.
5. **Merge after the call.** ffmpeg joins the parts into `call.webm` (playback: both voices in
   both ears) and `call-audio.webm` (transcription: channels kept apart), then deletes the parts.
6. **Playback.** The browser asks for a link — a JWT valid for 30 minutes, signed with a secret
   separate from the login one. The `<video>` element streams `/recordings/<token>` with range
   requests, so seeking works without downloading the file. An expired link is renewed and
   playback resumes at the same spot.

**Trade-offs.**
- Recording in the browser follows from P2P — only the browsers have both streams. The client's
  browser was chosen because it is the client's screen and the client's consent. The cost is
  that recording depends on that tab: if it crashes, everything up to the last chunk is kept.
- Recording the composed call (screen and people) rather than the raw shared screen makes the
  video understandable on its own, at the cost of some client CPU (1280×720 at 15 fps).
- Uploading every 5 seconds limits loss to a few seconds, at the cost of many small files to
  order and merge.
- Signed links let the video element stream directly; an authenticated `fetch` would have to
  download the whole file before playing.

**In production.**
- **Storage on S3.** The browser uploads chunks straight to S3 with presigned multipart-upload
  URLs, so media never passes through the API. Buckets are encrypted (KMS), with lifecycle
  rules for retention and deletion.
- **Delivery through a CDN** (CloudFront signed URLs) instead of the API serving files.
- **Server-side recording** through the SFU, removing the dependency on the client's tab.
- **Consent audit trail** stored with each recording.

## 10. Transcription and summary

**Today.** A recorded call is processed a few seconds after it ends (the wait lets the last
chunks land), as a pipeline:

```
merge (ffmpeg) ──► transcribe (Sarvam | Deepgram) ──► summarize (Gemini | Claude) ──► READY
```

Each step is skipped if its output already exists, so a retry or a server restart picks up
where it stopped; calls left mid-processing are re-queued on startup.

**Speaker names come from the audio channels, not from voice analysis.** Left channel = client,
right = consultant. Diarization (guessing speakers from voices) can mix people up; separate
tracks per participant — what meeting tools do — makes attribution exact on a real call.

**Speech-to-text** sits behind one wrapper; one setting picks the provider.

- **Sarvam** (`saaras:v4`, current default) — strong on Indian languages and code-mixed speech.
  Its REST API accepts at most 30 seconds of mono audio, so ffmpeg's `silencedetect` finds the
  stretches of speech in each channel, each stretch is sent separately (four in parallel), and
  the cut points become the line times. Silence is never sent, which also saves cost.
- **Deepgram** (`nova-3`) — the whole stereo file in one request with `multichannel=true`; can
  also return a one-paragraph summary.

**Summary** — the transcript is sent to an LLM with a fixed JSON schema (problem, steps taken,
resolution, follow-ups) and validated with zod before it is stored. Gemini is the default;
Claude is wired in the same way. Because both must return the same shape, the UI doesn't care
which ran.

**Failure handling.**

| Step | Retries | If it still fails |
|---|---|---|
| Speech-to-text | 3 tries, 5 s then 15 s apart; only for network errors, timeouts, 429 and 5xx | Call `FAILED`; the recording can still be watched |
| Summary | 10 tries, moving to the next model in a list each time (a 503 "high demand" is usually one model) | Call stays `READY`; only the summary is missing |

Errors that a retry can't fix — a missing or invalid key — fail immediately.

**In the UI.** The call card shows "Processing" until the pipeline finishes, then "Transcript
ready" or "Transcript not available" from the status alone. The review screen shows the video,
the summary, and the transcript side by side; clicking a line seeks the video, and the list
follows playback.

**In production.**
- Processing runs in **dedicated workers** consuming a durable queue (SQS or BullMQ) with
  backoff and a dead-letter queue, scaled on backlog and isolated from the API.
- **Asynchronous provider APIs** — Deepgram callbacks or Sarvam's Batch API (files up to two
  hours) — instead of holding long requests open.
- **PII redaction** before transcripts are sent to an LLM, and data-processing agreements with
  each provider.
- **Metrics** on processing time and failure rate per provider, with alerts when one degrades.

## 11. Security and access control

- Every route except login and the playback link requires a JWT; sockets authenticate with the
  same token in the handshake.
- Role guards: clients raise requests, answer calls, allow recording and upload chunks;
  consultants start calls, request recording and resolve requests.
- Every call lookup filters by id **and** participant. Anyone else gets **404, not 403**, so the
  existence of a call can't be probed.
- Playback tokens use a separate secret and a `purpose` claim, so they can't be used to log in.
- Passwords are hashed with bcrypt; secrets come from the environment.

`server/test/access-control.spec.ts` boots the full API against an in-memory database and checks
that another client gets 404 for someone else's call, transcript and recording link, never sees
their requests, can't use consultant-only routes, and that nothing works without a valid token.

**In production.** SSO, organisations and consultant-to-client assignment; rate limits on login
and uploads; upload size and type validation; audit logs for consent and access to recordings;
retention and deletion policies under GDPR and India's DPDP Act.

## 12. Known limitations

- Switching microphone mid-call leaves the recorder on the old track, so that side goes silent
  in the recording. Choosing the microphone before joining works.
- STUN only — some networks can't connect without TURN.
- On one machine both "people" share a microphone, so a single-laptop demo needs headphones and
  only the speaking side unmuted.
- Processing and ring timers are in memory: restarts are handled, multiple instances are not.
- Tested mainly in Chrome; Safari records MP4 and is less tested.
