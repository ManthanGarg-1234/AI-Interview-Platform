const URL_FIELDS = new Set(["website", "linkedin", "linkedinUrl", "x", "xUrl", "careers", "careersUrl", "logoUrl"]);

export function normalizeUrl(value, { allowEmpty = true } = {}) {
  const raw = String(value || "").trim().replace(/\s+/g, "");
  if (!raw && allowEmpty) return "";
  const candidate = /^[a-z][a-z\d+\-.]*:/i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid website, like https://example.com");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http:// and https:// links are allowed");
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/$/, "");
}

export function normalizeDomain(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.includes("@") || /^[a-z][a-z\d+\-.]*:/i.test(raw)) {
    throw new Error("Enter a domain like xyz.com, without @ or https://");
  }
  const normalized = normalizeUrl(raw, { allowEmpty: false });
  return new URL(normalized).hostname;
}

function firstIssuePath(issue) {
  return Array.isArray(issue?.path) && issue.path.length ? issue.path.join(".") : "_form";
}

export function mapApiValidationError(error) {
  const payload = error?.response?.data?.error || error?.response?.data || error;
  const issues = payload?.issues || payload?.details?.issues || payload?.errors;
  const fieldErrors = {};
  if (Array.isArray(issues)) {
    issues.forEach((issue) => {
      const field = firstIssuePath(issue);
      if (!fieldErrors[field]) fieldErrors[field] = friendlyIssue(issue);
    });
  } else if (issues && typeof issues === "object") {
    Object.entries(issues).forEach(([field, value]) => {
      fieldErrors[field] = friendlyIssue({ message: Array.isArray(value) ? value[0] : value });
    });
  }
  const summary = payload?.message && !looksLikeJson(payload.message)
    ? payload.message
    : Object.values(fieldErrors)[0] || "Please check the highlighted fields and try again.";
  return { summary, fieldErrors };
}

function friendlyIssue(issue) {
  const message = String(issue?.message || issue || "");
  if (/url|website|link/i.test(message)) return "Enter a valid website, like https://example.com";
  if (/email/i.test(message)) return "Enter a valid email address";
  if (/required|expected/i.test(message)) return "This field is required";
  if (/too_small|min/i.test(message)) return "Enter a longer value";
  if (/too_big|max/i.test(message)) return "Enter a shorter value";
  return looksLikeJson(message) ? "Enter a valid value" : message;
}

function looksLikeJson(value) {
  return typeof value === "string" && (/^\s*[{[]/.test(value) || /zod|validationerror/i.test(value));
}

export function validateLogo(file) {
  if (!file) return "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "Logo must be a PNG, JPG, or WebP file";
  if (file.size > 2 * 1024 * 1024) return "Logo must be 2 MB or smaller";
  return "";
}
