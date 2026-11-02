import assert from "node:assert/strict";
import test from "node:test";
import { checkGuardOrigin, guardErrorResponse, readGuardObject, readGuardSettings, readNewSessionOptions } from "../src/server/guard-http.ts";

test("guard mutations accept same-origin browsers and AI clients while rejecting foreign origins", function () {
  const url = "http://127.0.0.1:3000/api/guards";
  assert.equal(checkGuardOrigin(new Request(url, { method: "POST" })), null);
  assert.equal(checkGuardOrigin(new Request(url, { method: "POST", headers: { Origin: "http://127.0.0.1:3000" } })), null);
  assert.equal(checkGuardOrigin(new Request(url, { method: "POST", headers: { Origin: "https://other.example" } })).status, 403);
  assert.equal(checkGuardOrigin(new Request(url, { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  assert.equal(checkGuardOrigin(new Request(url, { method: "POST", headers: { Origin: "null" } })).status, 403);
});

test("invalid settings and request bodies are rejected before creating a guard", function () {
  for (const value of [null, [], "text", 12]) assert.throws(function invalid() { readGuardObject(value); });
  assert.throws(function incomplete() { readGuardSettings({ sessionId: "one" }); }, /守护设置不完整/);
  const settings = { sessionId: "one", model: "m", reasoning: "high", startMessage: "start", retryMessage: "", completeMessage: "" };
  assert.deepEqual(readGuardSettings(settings), settings);
  assert.notEqual(readGuardSettings(settings), settings);
});

test("API errors retain conflict and not-found status codes", async function () {
  const error = new Error("Session occupied");
  error.status = 409;
  const response = guardErrorResponse(error);
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Session occupied" });
});

test("new-session creation is explicit and requires a non-empty project path", function () {
  assert.equal(readNewSessionOptions(undefined), undefined);
  for (const value of [null, [], "directory", {}, { projectPath: 1 }, { projectPath: "   " }]) {
    assert.throws(function invalid() { readNewSessionOptions(value); });
  }
  const selected = { projectPath: process.cwd() };
  assert.deepEqual(readNewSessionOptions(selected), selected);
});
