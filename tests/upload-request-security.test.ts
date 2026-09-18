import { describe, expect, test } from "bun:test";
import { validateUploadRequestHeaders } from "../src/lib/upload-request-security";

const MAX = 20 * 1024 * 1024;

describe("upload request security", () => {
  test("rejects cross-site POSTs before parsing multipart data", () => {
    const request = new Request("https://animal.higgsfield.app/api/media/upload", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    expect(validateUploadRequestHeaders(request, MAX)).toMatchObject({
      status: 403,
      code: "invalid_origin",
    });
  });

  test("rejects a declared oversized body", () => {
    const request = new Request("https://animal.higgsfield.app/api/media/upload", {
      method: "POST",
      headers: {
        origin: "https://animal.higgsfield.app",
        "content-length": String(MAX + 1),
      },
    });
    expect(validateUploadRequestHeaders(request, MAX)).toMatchObject({
      status: 413,
      code: "file_too_large",
    });
  });

  test("allows same-origin requests within the declared limit", () => {
    const request = new Request("https://animal.higgsfield.app/api/media/upload", {
      method: "POST",
      headers: {
        origin: "https://animal.higgsfield.app",
        "content-length": "1024",
      },
    });
    expect(validateUploadRequestHeaders(request, MAX)).toBeUndefined();
  });
});
