# Your First Background Job (FlyRank Internship - Week 7 / A7)

A durable background job processing service built with **Express** and **Inngest**.

The API responds to slow, resource-intensive requests immediately with `202 Accepted` and offloads execution into durable background steps with automated retries and cron scheduling.

---

## 1. Endpoints and Inngest Functions

### Endpoints Table
| Endpoint | Method | Status Code | Purpose |
|---|---|---|---|
| `/health` | GET | `200 OK` | Liveness health check |
| `/reports` | POST | `202 Accepted` | Accepts `{ "topic": "cats" }`, triggers Inngest job, returns ID |
| `/reports/:id` | GET | `200 OK` / `404` | Status polling (`pending` -> `done` with result) |
| `/reports` | GET | `200 OK` | Lists all created reports (Control Panel) |
| `/api/inngest` | ALL | `200 OK` | Inngest SDK serve handler |

### Inngest Functions Table
| Function ID | Trigger | Key Steps & Behavior |
|---|---|---|
| `say-hello` | `test/hello` | 5-second `step.sleep` simulation |
| `make-report` | `report/requested` | 8-second `step.sleep`, `build-report` step, 2 retries with backoff on failure |
| `heartbeat` | Cron `* * * * *` | Every minute summary logger of pending, done, and failed jobs |

---

## 2. How to Run

### Install Dependencies
```bash
npm install
```

### Terminal 1: Start Inngest Dev Server
```bash
npx inngest-cli dev -u http://127.0.0.1:3000/api/inngest --no-discovery
```

### Terminal 2: Start Express API
```bash
node server.js
```

---

## 3. The 202-Then-Poll Proof

### Step 1: Submit Report Request (Answers in milliseconds with 202)
```bash
curl -i -X POST http://localhost:3000/reports \
  -H "Content-Type: application/json" \
  -d '{"topic":"cats"}'
```

**Response (202 Accepted):**
```http
HTTP/1.1 202 Accepted
Content-Type: application/json; charset=utf-8

{"id":"rep_1791968636714_38o43","status":"pending"}
```

### Step 2: Immediate Poll (Eventual Consistency in progress)
```bash
curl -s http://localhost:3000/reports/rep_1791968636714_38o43
```

**Response:**
```json
{
  "id": "rep_1791968636714_38o43",
  "topic": "cats",
  "status": "pending",
  "createdAt": "2026-10-14T09:03:56.714Z"
}
```

### Step 3: Poll After 9 Seconds (Background Job completed)
```bash
curl -s http://localhost:3000/reports/rep_1791968636714_38o43
```

**Response:**
```json
{
  "id": "rep_1791968636714_38o43",
  "topic": "cats",
  "status": "done",
  "result": "Executive Summary for topic: CATS.\nAll data analysis successfully aggregated and verified.",
  "completedAt": "2026-10-14T09:04:05.293Z"
}
```

---

## 4. Architectural Reflections

### Stage 3 Sentence: Input Validation vs. Job Retries
> A client error like a missing payload field must be rejected at the HTTP boundary with a `400 Bad Request` because no amount of retrying can fix malformed input, whereas background retries are reserved strictly for transient operational failures (network drops, downstream timeouts, or momentary service hiccups).

### Stage 4 Sentences: Scheduled Cron Expressions
> - To run the heartbeat report every day at 08:00, the cron expression is `0 8 * * *`.
> - To run the heartbeat report every Sunday at 22:00, the cron expression is `0 22 * * 0`.
