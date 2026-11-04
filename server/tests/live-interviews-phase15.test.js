"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  signalSchema,
  signRoomToken,
  verifyRoomToken,
  tokenTtlMs,
  iceServers,
} = require("../webrtc-signaling");

test("WebRTC signaling accepts bounded offers and ICE candidates only", () => {
  const offer = signalSchema.safeParse({
    to: "29ca3668-65b3-490e-b0ae-37d4ff6c3437",
    description: { type: "offer", sdp: "v=0\r\n" },
  });
  const candidate = signalSchema.safeParse({
    candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
  });
  const invalid = signalSchema.safeParse({ description: { type: "offer", sdp: "" } });
  assert.equal(offer.success, true);
  assert.equal(candidate.success, true);
  assert.equal(invalid.success, false);
});

test("room tokens are issuer-bound and use the configured bounded TTL", () => {
  const previous = process.env.WEBRTC_TOKEN_TTL_MS;
  process.env.WEBRTC_TOKEN_TTL_MS = "60000";
  try {
    const token = signRoomToken({
      roomId: "29ca3668-65b3-490e-b0ae-37d4ff6c3437",
      userId: "e93d79e9-acde-42ea-a47c-303c63db95ab",
      role: "CANDIDATE",
    });
    const claims = verifyRoomToken(token);
    assert.equal(claims.typ, "webrtc-room");
    assert.equal(claims.roomId, "29ca3668-65b3-490e-b0ae-37d4ff6c3437");
    assert.ok(claims.exp - claims.iat <= 60);
    assert.equal(tokenTtlMs(), 60000);
  } finally {
    if (previous === undefined) delete process.env.WEBRTC_TOKEN_TTL_MS;
    else process.env.WEBRTC_TOKEN_TTL_MS = previous;
  }
});

test("TURN is only advertised when all credentials are configured", () => {
  const previous = {
    url: process.env.WEBRTC_TURN_URL,
    username: process.env.WEBRTC_TURN_USERNAME,
    credential: process.env.WEBRTC_TURN_CREDENTIAL,
  };
  process.env.WEBRTC_TURN_URL = "";
  process.env.WEBRTC_TURN_USERNAME = "";
  process.env.WEBRTC_TURN_CREDENTIAL = "";
  assert.equal(iceServers().length, 1);
  process.env.WEBRTC_TURN_URL = "turn:example.test";
  process.env.WEBRTC_TURN_USERNAME = "user";
  process.env.WEBRTC_TURN_CREDENTIAL = "credential";
  assert.equal(iceServers().length, 2);
  Object.entries(previous).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
});
