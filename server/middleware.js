"use strict";

function requireUser(req, res, next) {
  const configured = String(process.env.DEMO_USER_IDS || "demo-candidate").split(",").map((value) => value.trim()).filter(Boolean);
  const userId = req.get("x-demo-user-id");
  if (!userId || !configured.includes(userId)) return res.status(401).json({ error: "Authenticated candidate context is required." });
  req.user = { id: userId, role: "candidate" };
  next();
}

function rateLimit(windowMs = 60000, max = 30) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    const current = hits.get(key);
    if (!current || now - current.started > windowMs) hits.set(key, { started: now, count: 1 });
    else current.count += 1;
    const item = hits.get(key);
    if (item.count > max) return res.status(429).json({ error: "Too many coding requests. Try again later." });
    next();
  };
}

module.exports = { requireUser, rateLimit };
