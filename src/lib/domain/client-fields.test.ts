import { describe, expect, it } from "vitest";
import { joinList, nextActionDone, parseList, prospectReviewNeeded, unmappedValues } from "./client-fields";

describe("client field rules", () => {
  it("parses and joins comma-separated lists", () => {
    expect(parseList("London, South East")).toEqual(["London", "South East"]);
    expect(parseList("")).toEqual([]);
    expect(joinList(["London", "South East"])).toBe("London, South East");
  });
  it("flags stored values missing from the option list without dropping them", () => {
    expect(unmappedValues(["London", "Legacy region"], ["London", "Wales"])).toEqual(["Legacy region"]);
  });
  it("tracks next-action completion only when explicitly done", () => {
    expect(nextActionDone({ next_action_done: "done" })).toBe(true);
    expect(nextActionDone({})).toBe(false);
  });
  it("prompts review for a prospect with live projects but never changes status", () => {
    expect(prospectReviewNeeded("prospect", 2)).toBe(true);
    expect(prospectReviewNeeded("prospect", 0)).toBe(false);
    expect(prospectReviewNeeded("active", 3)).toBe(false);
  });
});
