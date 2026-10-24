import { describe, it, expect } from "vitest";

describe("TrustVault security checks", () => {
  it("should reject requests without an authentication token", async () => {
    const response = await fetch("http://localhost:4000/api/documents");

    expect(response.status).toBe(401);
  });

  it("should reject requests without a token for audit logs", async () => {
    const response = await fetch("http://localhost:4000/api/audit-logs");

    expect(response.status).toBe(401);
  });

  it("should return the API health status", async () => {
    const response = await fetch("http://localhost:4000/api/health");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
  });
});