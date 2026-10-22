import { describe, expect, it } from "vitest";
import { reviewHref, safeFrom } from "./links";

describe("reviewHref", () => {
  it("encodes scope and return path", () => {
    expect(reviewHref({})).toBe("/review");
    expect(reviewHref({ deck: "d1", topic: "Mạng & VPC", from: "/deck/d1/overview" })).toBe(
      "/review?deck=d1&topic=M%E1%BA%A1ng+%26+VPC&from=%2Fdeck%2Fd1%2Foverview",
    );
    expect(reviewHref({ ids: ["a", "b"] })).toBe("/review?ids=a%2Cb");
  });
});

describe("safeFrom", () => {
  it("keeps in-app paths and rejects other sites", () => {
    expect(safeFrom("/deck/x/cards?card=1")).toBe("/deck/x/cards?card=1");
    expect(safeFrom(undefined)).toBe("/");
    expect(safeFrom("https://evil.example")).toBe("/");
    expect(safeFrom("//evil.example")).toBe("/");
    expect(safeFrom("/\\evil.example")).toBe("/");
  });
});
