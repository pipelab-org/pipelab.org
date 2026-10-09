import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/worker.js";

const ENV = {
  RESEND_API_KEY: "resend-test-key",
  TURNSTILE_SECRET_KEY: "turnstile-test-secret",
};

function contactRequest(reason = "general") {
  return new Request("https://pipelab.org/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": "203.0.113.10",
      "User-Agent": "worker-contact-test",
    },
    body: JSON.stringify({
      name: "Test Sender",
      email: "sender@example.com",
      reason,
      message: "Please validate this contact form submission.",
      website: "",
      "cf-turnstile-response": "turnstile-response-token",
    }),
  });
}

function contactFormRequest(
  reason = "general",
  overrides = {},
  url = "https://pipelab.org/api/contact"
) {
  const body = new URLSearchParams({
    name: "Test Sender",
    email: "sender@example.com",
    reason,
    message: "Please validate this contact form submission.",
    website: "",
    "cf-turnstile-response": "turnstile-response-token",
    ...overrides,
  });
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "cf-connecting-ip": "203.0.113.10",
      "User-Agent": "worker-contact-fallback-test",
    },
    body,
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

    if (target === "https://api.resend.com/emails") {
      return new Response(null, { status: 200 });
    }

    throw new Error(`unexpected fetch: ${target}`);
  };

  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("contact form accepts a valid Turnstile token from an allowed hostname", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    const response = await worker.fetch(contactRequest(), ENV);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(
      calls.filter((call) => call.url === "https://api.resend.com/emails").length,
      1
    );
  });
});

test("contact form accepts the native POST fallback without trusting its request host", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    const response = await worker.fetch(
      contactFormRequest("trial", {}, "https://attacker.example/api/contact"),
      ENV
    );

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/contact/#message-sent");
    assert.equal(response.headers.get("cache-control"), "no-store");
    const resendCall = calls.find((call) => call.url === "https://api.resend.com/emails");
    assert.ok(resendCall);
    assert.match(JSON.parse(resendCall.init.body).subject, /^\[trial\] /);
  });
});

test("native browser fallback rejects a missing Turnstile token before email", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    const response = await worker.fetch(
      contactFormRequest("general", { "cf-turnstile-response": "" }),
      ENV
    );

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/contact/#message-error");
    assert.equal(calls.length, 0);
  });
});

test("native browser fallback rejects an unexpected Turnstile hostname before email", async () => {
  await withMockFetch({ success: true, hostname: "attacker.example" }, async (calls) => {
    const response = await worker.fetch(contactFormRequest(), ENV);

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/contact/#message-error");
    assert.equal(
      calls.filter((call) => call.url === "https://api.resend.com/emails").length,
      0
    );
  });
});

test("native browser fallback treats a filled honeypot as benign without email", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    const response = await worker.fetch(
      contactFormRequest("general", { website: "https://spam.example" }),
      ENV
    );

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/contact/#message-sent");
    assert.equal(calls.length, 0);
  });
});

test("contact form routes a 30-day Pro trial request", async () => {
  await withMockFetch({ success: true, hostname: "pipelab.org" }, async (calls) => {
    const response = await worker.fetch(contactRequest("trial"), ENV);

    assert.equal(response.status, 200);
    const resendCall = calls.find((call) => call.url === "https://api.resend.com/emails");
    assert.ok(resendCall);
    assert.match(JSON.parse(resendCall.init.body).subject, /^\[trial\] /);
  });
});

test("contact form accepts a valid Turnstile token from a Pages preview hostname", async () => {
  await withMockFetch(
    { success: true, hostname: "fix-turnstile-hostname-check.pipelab.pages.dev" },
    async (calls) => {
      const response = await worker.fetch(contactRequest(), ENV);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(
        calls.filter((call) => call.url === "https://api.resend.com/emails").length,
        1
      );
    }
  );
});

test("contact form rejects a successful Turnstile token from an unexpected hostname", async () => {
  await withMockFetch({ success: true, hostname: "attacker.example" }, async (calls) => {
    const response = await worker.fetch(contactRequest(), ENV);

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Captcha verification failed" });
    assert.equal(
      calls.filter((call) => call.url === "https://api.resend.com/emails").length,
      0
    );
  });
});

test("contact form rejects a nested Pages hostname outside the preview pattern", async () => {
  await withMockFetch(
    { success: true, hostname: "nested.fix-turnstile-hostname-check.pipelab.pages.dev" },
    async (calls) => {
      const response = await worker.fetch(contactRequest(), ENV);

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "Captcha verification failed" });
      assert.equal(
        calls.filter((call) => call.url === "https://api.resend.com/emails").length,
        0
      );
    }
  );
});

test("contact form rejects a malformed Turnstile siteverify response", async () => {
  await withMockFetch(
    () => new Response("not-json", { status: 200 }),
    async (calls) => {
      const response = await worker.fetch(contactRequest(), ENV);

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "Captcha verification failed" });
      assert.equal(
        calls.filter((call) => call.url === "https://api.resend.com/emails").length,
        0
      );
    }
  );
});

test("contact form rejects a Turnstile siteverify response missing hostname", async () => {
  await withMockFetch({ success: true }, async (calls) => {
    const response = await worker.fetch(contactRequest(), ENV);

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Captcha verification failed" });
    assert.equal(
      calls.filter((call) => call.url === "https://api.resend.com/emails").length,
      0
    );
  });
});
