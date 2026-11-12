# HelpDesk — Client Help Portal

A small portal where clients raise help requests and a consultant calls them back. Calls are
peer-to-peer video with screen sharing. With the client's consent the call is recorded, and
afterwards both people get the recording, a transcript with speaker names, and a summary.

- **Web:** Vue 3, TypeScript, Pinia, Vue Router, Vite
- **API:** NestJS, TypeORM (SQLite), Socket.IO
- **Calls:** WebRTC (signalling over Socket.IO)
- **After the call:** ffmpeg (merge), Sarvam or Deepgram (transcript), Gemini or Claude (summary)

See [DESIGN.md](DESIGN.md) for how it fits together.

## Running it

Requires Node 20+ (built on Node 24) and Chrome. ffmpeg comes bundled through `ffmpeg-static`.

### 1. API

```bash
cd server
npm install
```

Create `server/.env`:

```
JWT_SECRET=any-long-random-string
SARVAM_API_KEY=...
DEEPGRAM_API_KEY=...
GEMINI_API_KEY=...
# Only if the summary is switched to Claude:
ANTHROPIC_API_KEY=...
```

Optional: `PORT` (default `3001`), `DB_PATH` (default `dev.db`), `RECORDINGS_DIR` (default `recordings`).

```bash
npm run start:dev
```

The database is created on first start and the demo users are seeded.

### 2. Web

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. If the API runs somewhere else, set `VITE_API_URL`.

### Tests

```bash
cd server
npm test
```

`test/access-control.spec.ts` boots the whole API against an in-memory database and checks that
users only reach their own data: another client gets 404 for someone else's call, transcript and
recording link, never sees their requests, can't use consultant-only routes, and nothing works
without a valid token.

## Demo accounts

All passwords are `password`. The login page also has one-click buttons for each account.

| Name | Email | Role |
|---|---|---|
| Sam Carter | sam@consultant.test | Consultant |
| Alex Morgan | alex@client.test | Client |
| Jordan Lee | jordan@client.test | Client |

## Trying the full flow

1. Sign in as **Alex** in one window and **Sam** in another. Sessions are per tab, so two windows
   of the same browser work.
2. As Alex, try the payout on the home page (it always fails), then raise a request about it.
   It shows up in Sam's queue straight away.
3. As Sam, start a call from the request. Alex joins, shares the screen, and both can talk.
4. Sam asks to record; Alex allows it. The recording uploads in 5-second chunks during the call.
5. End the call. The call card shows *Processing*, then *Ready*. Open the recording to see the
   video, the summary and the transcript. Click a transcript line to jump to that moment.


## Project layout

```
server/src
  auth/            login, JWT guard, role guard
  users/           user entity + demo seed
  help-requests/   requests: create, list, resolve
  calls/           call lifecycle, recording upload, processing (merge, transcribe, summarize)
  communication/   Socket.IO gateway for live updates
web/src
  api/             REST client
  communication/   socket, WebRTC peer, recorder
  stores/          auth, active call, toasts
  views/ components/
```

## Known limitations

- STUN only, no TURN server: calls between some networks (strict NAT) won't connect.
- SQLite with `synchronize: true` — fine for a demo, migrations would be needed for production.
- Processing is scheduled in memory on a single server. A restart re-queues unfinished calls,
  but several API instances would need a real job queue.
- Recordings are stored on local disk.
- Tested in Chrome. Recording falls back to MP4 in Safari, which is less tested.
