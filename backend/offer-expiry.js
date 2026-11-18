"use strict";

const { Queue } = require("bullmq");
const { getPrisma } = require("./prisma");
const { invalidateRecruiterCache } = require("./recruiter");

const QUEUE_NAME = "offer-expiry";
let queue;
let fallbackTimer;

function redisConnection() {
  const url = new URL(process.env.REDIS_URL);
  return { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined };
}

function getOfferExpiryQueue() {
  if (!process.env.REDIS_URL) return null;
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: redisConnection() });
  return queue;
}

async function expireOffers(now = new Date()) {
  const prisma = getPrisma();
  const offers = await prisma.offer.findMany({
    where: { status: "SENT", expiresAt: { lte: now } },
    include: { application: { include: { job: true } } },
  });
  let expired = 0;
  for (const offer of offers) {
    const changed = await prisma.$transaction(async (tx) => {
      const result = await tx.offer.updateMany({
        where: { id: offer.id, status: "SENT", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      if (!result.count) return false;
      await tx.auditLog.create({
        data: {
          action: "OFFER_EXPIRED",
          resourceType: "OFFER",
          resourceId: offer.id,
          before: { status: "SENT" },
          after: { status: "EXPIRED" },
          requestId: "offer-expiry-job",
        },
      });
      await tx.notification.createMany({
        data: [
          {
            userId: offer.studentUserId,
            type: "APPLICATION",
            title: "Offer expired",
            body: `Your offer for ${offer.application.job.title} has expired.`,
            resourceType: "OFFER",
            resourceId: offer.id,
          },
          {
            userId: offer.createdByUserId,
            type: "APPLICATION",
            title: "Offer expired",
            body: `The offer for ${offer.application.job.title} has expired.`,
            resourceType: "OFFER",
            resourceId: offer.id,
          },
        ],
      });
      return true;
    });
    if (changed) expired += 1;
  }
  if (expired) await invalidateRecruiterCache([...new Set(offers.map((offer) => offer.application.job.companyId))]);
  return expired;
}

async function enqueueOfferExpiry() {
  const currentQueue = getOfferExpiryQueue();
  if (!currentQueue) return false;
  try {
    await currentQueue.add("expire-offers", {}, { repeat: { every: 60_000 }, jobId: "offer-expiry-schedule" });
    return true;
  } catch (error) {
    currentQueue.close().catch(() => {});
    queue = undefined;
    console.error("Offer expiry queue unavailable; using synchronous fallback.", error.message);
    return false;
  }
}

function startOfferExpiryFallback(intervalMs = 60_000) {
  if (fallbackTimer) return fallbackTimer;
  fallbackTimer = setInterval(() => expireOffers().catch((error) => console.error("Offer expiry fallback failed", error)), intervalMs);
  fallbackTimer.unref?.();
  return fallbackTimer;
}

function stopOfferExpiryFallback() {
  if (fallbackTimer) clearInterval(fallbackTimer);
  fallbackTimer = undefined;
}

module.exports = {
  QUEUE_NAME,
  expireOffers,
  enqueueOfferExpiry,
  startOfferExpiryFallback,
  stopOfferExpiryFallback,
  redisConnection,
};
