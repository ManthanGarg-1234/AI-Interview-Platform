"use strict";

const { Worker } = require("bullmq");
const { QUEUE_NAME, expireOffers, enqueueOfferExpiry, startOfferExpiryFallback, redisConnection } = require("./offer-expiry");

function startOfferExpiryWorker() {
  if (!process.env.REDIS_URL) return null;
  return new Worker(QUEUE_NAME, () => expireOffers(), { connection: redisConnection() });
}

if (require.main === module) {
  if (!process.env.REDIS_URL) {
    const { startOfferExpiryFallback } = require("./offer-expiry");
    startOfferExpiryFallback();
    console.log("Offer expiry synchronous fallback started.");
  } else {
    startOfferExpiryWorker();
    enqueueOfferExpiry().catch((error) => {
      console.error("Could not schedule offer expiry jobs.", error.message);
      startOfferExpiryFallback();
    });
    console.log("Offer expiry worker started.");
  }
}

module.exports = { startOfferExpiryWorker };
