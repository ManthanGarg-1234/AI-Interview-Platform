"use strict";

const { OAuth2Client } = require("google-auth-library");

function createGoogleOAuthClient(config) {
  return new OAuth2Client(
    config.GOOGLE_OAUTH_CLIENT_ID,
    config.GOOGLE_OAUTH_CLIENT_SECRET,
    config.GOOGLE_OAUTH_CALLBACK_URL,
  );
}

module.exports = { createGoogleOAuthClient };
