"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { canJoinInterview, signalSchema } = require("../webrtc-signaling");

test("live interview join window opens 15 minutes early and closes at scheduled end", () => {
  const startsAt = new Date("2030-01-01T10:00:00.000Z");
  const endsAt = new Date("2030-01-01T11:00:00.000Z");
  const interview = { status: "SCHEDULED", scheduledStart: startsAt, scheduledEnd: endsAt };

  assert.equal(canJoinInterview(interview, new Date("2030-01-01T09:44:59.999Z")), false);
  assert.equal(canJoinInterview(interview, new Date("2030-01-01T09:45:00.000Z")), true);
  assert.equal(canJoinInterview(interview, endsAt), true);
  assert.equal(canJoinInterview(interview, new Date("2030-01-01T11:00:00.001Z")), false);
  assert.equal(canJoinInterview({ ...interview, status: "CANCELLED" }, new Date("2030-01-01T10:00:00.000Z")), false);
});

test("WebRTC signaling requires a valid recipient and a description or ICE candidate", () => {
  const recipient = "9d38c9a1-6ba0-4b9e-9fd8-50a6b22a7540";
  assert.equal(signalSchema.safeParse({ to: recipient, description: { type: "offer", sdp: "v=0" } }).success, true);
  assert.equal(signalSchema.safeParse({ description: { type: "offer", sdp: "v=0" } }).success, false);
  assert.equal(signalSchema.safeParse({ to: recipient }).success, false);
});
