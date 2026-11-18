import { describe, expect, it } from "vitest";
import { mapApiValidationError, normalizeDomain, normalizeUrl, validateLogo } from "./recruiterValidation";

describe("recruiter validation helpers", () => {
  it("normalizes schemeless URLs and lowercases domains", () => {
    expect(normalizeUrl(" XYZ.in ")).toBe("https://xyz.in");
    expect(normalizeDomain(" XYZ.COM ")).toBe("xyz.com");
  });

  it("rejects unsafe schemes", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow("Only http:// and https:// links are allowed");
    expect(() => normalizeUrl("data:text/html,test")).toThrow("Only http:// and https:// links are allowed");
    expect(() => normalizeDomain("https://xyz.com")).toThrow("without @ or https://");
  });

  it("maps validation issues to friendly field messages without JSON", () => {
    const mapped = mapApiValidationError({ response: { data: { error: { issues: [{ path: ["website"], message: "Invalid URL" }] } } } });
    expect(mapped.fieldErrors.website).toBe("Enter a valid website, like https://example.com");
    expect(mapped.summary).not.toMatch(/[{\[]/);
  });

  it("validates supported logo types and size", () => {
    expect(validateLogo(new File(["x"], "logo.svg", { type: "image/svg+xml" }))).toMatch(/PNG/);
    expect(validateLogo(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "logo.png", { type: "image/png" }))).toMatch(/2 MB/);
    expect(validateLogo(new File(["x"], "logo.webp", { type: "image/webp" }))).toBe("");
  });
});
