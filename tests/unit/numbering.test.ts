import { describe, it, expect } from "vitest";
import { normalizeNumber, compareNormalized } from "@/lib/structure/numbering";

describe("numbering", () => {
  it("normalizes Q1", () => {
    expect(normalizeNumber("Q1").normalized).toBe("1");
  });
  it("Q 1l (a) → 11(a) preserves raw", () => {
    const p = normalizeNumber("Q 1l (a)");
    expect(p.raw).toBe("Q 1l (a)");
    expect(p.normalized).toBe("11(a)");
  });
  it("Question 1.", () => {
    const p = normalizeNumber("Question 1.");
    expect(p.normalized).toBe("1");
  });
  it("1(a)", () => {
    const p = normalizeNumber("1(a)");
    expect(p.normalized).toBe("1(a)");
    expect(p.depth).toBe(1);
    expect(p.parent).toBe("1");
  });
  it("11(b)", () => {
    expect(normalizeNumber("11(b)").normalized).toBe("11(b)");
  });
  it("(a) standalone", () => {
    expect(normalizeNumber("(a)").normalized).toBe("(a)");
  });
  it("hierarchy 11 → 11(a) parent", () => {
    const parent = normalizeNumber("11");
    const child = normalizeNumber("11(a)");
    expect(child.parent).toBe("11");
    expect(child.depth).toBe(1);
  });
  it("compareNormalized orders", () => {
    const arr = ["11(b)", "11", "11(a)", "2", "1"];
    const sorted = [...arr].sort(compareNormalized);
    expect(sorted).toEqual(["1", "2", "11", "11(a)", "11(b)"]);
  });
  it("roman subpart", () => {
    const p = normalizeNumber("1(a)(i)");
    expect(p.depth).toBe(2);
  });
});
