"use strict";

const argon2 = require("argon2");
const bcrypt = require("bcryptjs");

const argonOptions = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

async function hashPassword(password) {
  return argon2.hash(password, argonOptions);
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return { valid: false, upgradedHash: null };

  if (storedHash.startsWith("$argon2id$")) {
    try {
      return { valid: await argon2.verify(storedHash, password), upgradedHash: null };
    } catch (error) {
      if (error instanceof TypeError) return { valid: false, upgradedHash: null };
      throw error;
    }
  }

  if (/^\$2[aby]\$/.test(storedHash)) {
    const valid = await bcrypt.compare(password, storedHash);
    return { valid, upgradedHash: valid ? await hashPassword(password) : null };
  }

  return { valid: false, upgradedHash: null };
}

module.exports = { hashPassword, verifyPassword };
