const express = require("express");
const { Inngest } = require("inngest");
const { serve } = require("inngest/express");

const app = express();
app.use(express.json());

process.env.INNGEST_DEV = "1";

const inngest = new Inngest({
  id: "report-api",
  isDev: true,
  baseUrl: process.env.INNGEST_BASE_URL || "http://127.0.0.1:8288",
});

// In-memory storage for reports
const reports = new Map();

// Stage 1: say-hello function
const sayHello = inngest.createFunction(
  {
    id: "say-hello",
    name: "Say Hello Background Function",
    triggers: [{ event: "test/hello" }],
  },
  async ({ step }) => {
    await step.sleep("sleep-5-seconds", "5s");
    return "Hello from the background!";
  }
);

// Stage 2 & 3: make-report function
const makeReport = inngest.createFunction(
  {
    id: "make-report",
    name: "Make Report Generator",
    triggers: [{ event: "report/requested" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    // Simulate 8s of slow background work
    await step.sleep("do-the-slow-work", "8s");

    const reportResult = await step.run("build-report", async () => {
      // Stage 3: trigger retry on topic 'fail'
      if (topic === "fail") {
        throw new Error("The report oven is broken!");
      }

      const generatedAt = new Date().toISOString();
      const content = `Executive Summary for topic: ${topic.toUpperCase()}.\nAll data analysis successfully aggregated and verified.`;

      const completedReport = {
        id,
        topic,
        status: "done",
        result: content,
        completedAt: generatedAt,
      };

      reports.set(id, completedReport);
      return completedReport;
    });

    return reportResult;
  }
);

// Stage 4: cron heartbeat function
const heartbeat = inngest.createFunction(
  {
    id: "heartbeat",
    name: "System Heartbeat Cron",
    triggers: [{ cron: "* * * * *" }],
  },
  async ({ step }) => {
    return await step.run("log-summary", async () => {
      let pending = 0;
      let done = 0;
      let failed = 0;

      for (const report of reports.values()) {
        if (report.status === "pending") pending++;
        else if (report.status === "done") done++;
        else if (report.status === "failed") failed++;
      }

      const summaryLine = `[HEARTBEAT ${new Date().toISOString()}] Reports: ${pending} pending, ${done} done, ${failed} failed (Total: ${reports.size})`;
      console.log(summaryLine);
      return summaryLine;
    });
  }
);

// Inngest endpoint
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [sayHello, makeReport, heartbeat],
  })
);

// GET /health
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// POST /reports
app.post("/reports", async (req, res) => {
  const { topic } = req.body || {};

  // Stage 3 Validation: missing topic returns 400 immediately, creates no job
  if (!topic || typeof topic !== "string" || topic.trim() === "") {
    return res.status(400).json({ error: "Missing required field: topic" });
  }

  const id = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newReport = {
    id,
    topic: topic.trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  reports.set(id, newReport);

  // Send event to Inngest to begin background execution
  await inngest.send({
    name: "report/requested",
    data: {
      id,
      topic: topic.trim(),
    },
  });

  // Return 202 Accepted immediately
  return res.status(202).json({
    id,
    status: "pending",
  });
});

// GET /reports/:id
app.get("/reports/:id", (req, res) => {
  const { id } = req.params;
  const report = reports.get(id);

  if (!report) {
    return res.status(404).json({ error: "Report not found" });
  }

  return res.status(200).json(report);
});

// GET /reports - List all reports (Control panel extra)
app.get("/reports", (req, res) => {
  return res.status(200).json(Array.from(reports.values()));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Report API listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, inngest, reports };
