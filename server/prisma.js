"use strict";

const { PrismaClient } = require("@prisma/client");

let client;
function getPrisma() {
  if (!process.env.DATABASE_URL) {
    const error = new Error("DATABASE_URL is not configured.");
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }
  client ||= new PrismaClient();
  return client;
}

module.exports = { getPrisma };
