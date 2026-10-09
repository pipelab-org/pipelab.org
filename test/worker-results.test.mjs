import assert from "node:assert/strict";
import test from "node:test";

import pg from "pg";
import worker from "../src/worker.js";

const ENV = {
  TURNSTILE_SECRET_KEY: "turnstile-test-secret",
};

const VALID_PAYLOAD = {
  gauntlet_version: "1.0",
  scoring_version: "2.0",
  runner_version: "0.2.0",
  tool: "pipelock",
  tool_version: "3.1.0",
  corpus_version: "v2.0.0",
  corpus_sha256: "cb0c11b1ba74f75b891b9706ae3e87116bfb2ef05b1920959011035ac62ed778",
  tool_profile_sha256:
    "dc5b702f76de05a38dc209344febd1081e2c9a16aa282b92668503dad8cdc7cd",
  date: "2026-07-14T03:14:01Z",
  case_count: {
    total: 197,
    applicable: 196,
    not_applicable: 1,
    not_applicable_reasons: {
      missing_requires: 1,
    },
    errors: 0,
  },
  tool_support: {
    claims: ["url_dlp", "request_body_dlp"],
    unsupported_transports: [],
    unsupported_requires: ["dns_rebinding_fixture"],
  },
  scores: {
    full: {
      containment: 0.9932885906040269,
      false_positive_rate: 0,
      detection: 1,
      evidence: 1,
    },
    applicable: {
      containment: 1,
      false_positive_rate: 0,
      detection: 1,
      evidence: 1,
    },
  },
  sufficient: true,
  per_category: {
    url: {
      applicable: 20,
      containment: 1,
      false_positive_rate: 0,
      detection: 1,
      evidence: 1,
    },
    false_positive: {
      applicable: 20,
      containment: null,
      false_positive_rate: 0,
      detection: null,
      evidence: null,
    },
  },
};

function resultsRequest(body, headers = {}) {
  return new Request("https://pipelab.org/api/results", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": "203.0.113.20",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function withMockFetch(siteverifyResponse, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    const target = typeof url === "string" ? url : url.url;
    calls.push({ url: target, init });

    if (target === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
      assert.equal(init.method, "POST");
      return typeof siteverifyResponse === "function"
        ? siteverifyResponse()
        : Response.json(siteverifyResponse);
    }

    throw new Error(`unexpected fetch: ${target}`);
  };

  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withMockPg(fn) {
  const OriginalClient = pg.Client;
  const queries = [];

  pg.Client = class {
    async connect() {}

    async query(sql, params) {
      queries.push({ sql, params });
      return {
        rows: [{ id: "11111111-2222-4333-8444-555555555555" }],
      };
    }

    async end() {}
  };

  try {
    return await fn(queries);
  } finally {
    pg.Client = OriginalClient;
  }
}

test("results submission fails closed when Turnstile is not configured", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest({
          payload: VALID_PAYLOAD,
          public: true,
          "cf-turnstile-response": "turnstile-response-token",
        }),
        {}
      );

      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        error: "Results submission not configured",
      });
      assert.equal(calls.length, 0);
      assert.equal(queries.length, 0);
    });
  });
});

test("results submission rejects missing Turnstile token before DB insert", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest({ payload: VALID_PAYLOAD, public: true }),
        ENV
      );

      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), { error: "Captcha token missing" });
      assert.equal(calls.length, 0);
      assert.equal(queries.length, 0);
    });
  });
});

test("results submission rejects invalid Turnstile token before DB insert", async () => {
  await withMockFetch({ success: true, hostname: "attacker.example" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest({
          payload: VALID_PAYLOAD,
          public: true,
          "cf-turnstile-response": "turnstile-response-token",
        }),
        ENV
      );

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "Captcha verification failed",
      });
      assert.equal(calls.length, 1);
      assert.equal(queries.length, 0);
    });
  });
});

test("results submission rejects invalid public flag before captcha verification", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest({
          payload: VALID_PAYLOAD,
          public: "yes",
          "cf-turnstile-response": "turnstile-response-token",
        }),
        ENV
      );

      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), { error: "Invalid public flag" });
      assert.equal(calls.length, 0);
      assert.equal(queries.length, 0);
    });
  });
});

test("results submission rejects oversized bodies before captcha verification", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest(`{"payload":"${"x".repeat(262_145)}"}`),
        ENV
      );

      assert.equal(response.status, 413);
      assert.deepEqual(await response.json(), { error: "Payload too large" });
      assert.equal(calls.length, 0);
      assert.equal(queries.length, 0);
    });
  });
});

test("results submission rejects invalid gauntlet schema before DB insert", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest({
          payload: { tool: "pipelock", scores: { containment: 1 } },
          public: true,
          "cf-turnstile-response": "turnstile-response-token",
        }),
        ENV
      );

      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), {
        error:
          "Invalid payload: must match the Agent Egress Bench gauntlet summary schema",
      });
      assert.equal(calls.length, 1);
      assert.equal(queries.length, 0);
    });
  });
});

test("results submission inserts sanitized gauntlet payload after captcha verification", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest({
          payload: {
            ...VALID_PAYLOAD,
            ignored_extra_field: "do not store this",
          },
          public: false,
          "cf-turnstile-response": "turnstile-response-token",
        }),
        ENV
      );

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), {
        id: "11111111-2222-4333-8444-555555555555",
        url: "/gauntlet/results/11111111-2222-4333-8444-555555555555",
      });
      assert.equal(calls.length, 1);
      const siteverifyBody = new URLSearchParams(calls[0].init.body);
      assert.equal(siteverifyBody.get("remoteip"), "203.0.113.20");

      assert.equal(queries.length, 1);
      const inserted = JSON.parse(queries[0].params[0]);
      assert.equal(inserted.tool, "pipelock");
      assert.equal(inserted.date, "2026-07-14T03:14:01.000Z");
      assert.equal(inserted.ignored_extra_field, undefined);
      assert.equal(queries[0].params[1], false);
    });
  });
});

test("results submission rejects another vendor's tool before DB insert", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest({
          payload: { ...VALID_PAYLOAD, tool: "some-other-proxy" },
          public: true,
          "cf-turnstile-response": "turnstile-response-token",
        }),
        ENV
      );

      assert.equal(response.status, 422);
      const body = await response.json();
      assert.match(body.error, /Pipelock first-party run history only/);
      assert.equal(calls.length, 1);
      assert.equal(queries.length, 0);
    });
  });
});

test("results submission rejects another vendor's tool even when unlisted", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest({
          payload: { ...VALID_PAYLOAD, tool: "some-other-proxy" },
          public: false,
          "cf-turnstile-response": "turnstile-response-token",
        }),
        ENV
      );

      assert.equal(response.status, 422);
      assert.equal(queries.length, 0);
      assert.equal(calls.length, 1);
    });
  });
});

test("results submission accepts first-party tool name regardless of case and padding", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    await withMockPg(async (queries) => {
      const response = await worker.fetch(
        resultsRequest({
          payload: { ...VALID_PAYLOAD, tool: "Pipelock " },
          public: true,
          "cf-turnstile-response": "turnstile-response-token",
        }),
        ENV
      );

      assert.equal(response.status, 201);
      assert.equal(queries.length, 1);
      assert.equal(calls.length, 1);
    });
  });
});
