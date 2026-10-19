import { expect, it } from "vitest";
import { formatPages } from "./format";

it("formats page references the way cards show them", () => {
  expect(formatPages([], "notes.docx")).toBe("");
  expect(formatPages([12], "storage.pdf")).toBe("p.12");
  expect(formatPages([14, 12, 13], "storage.pdf")).toBe("p.12-14");
  expect(formatPages([3], "Security.PPTX")).toBe("slide 3");
  expect(formatPages([3, 4], "security.pptx")).toBe("slides 3-4");
  expect(formatPages([1], "notes_vi.PNG")).toBe("");
});
