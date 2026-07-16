import { describe, it, expect } from "vitest";
import { clampStep, countVisibleMarkers } from "../src/step-sync.js";

describe("countVisibleMarkers", () => {
  it("returns 0 for a null root", () => {
    expect(countVisibleMarkers(null)).toBe(0);
  });

  it("returns 0 for an empty div", () => {
    const div = document.createElement("div");
    expect(countVisibleMarkers(div)).toBe(0);
  });

  it("counts marker spans with the visible class, ignoring ones without it", () => {
    const div = document.createElement("div");
    div.innerHTML = `
      <span class="diascope-step-marker visible"></span>
      <span class="diascope-step-marker visible"></span>
      <span class="diascope-step-marker"></span>
    `;
    expect(countVisibleMarkers(div)).toBe(2);
  });

  it("counts markers nested inside other containers", () => {
    const div = document.createElement("div");
    div.innerHTML = `
      <div class="wrapper">
        <div class="another-wrapper">
          <span class="diascope-step-marker visible"></span>
        </div>
      </div>
      <span class="diascope-step-marker visible"></span>
    `;
    expect(countVisibleMarkers(div)).toBe(2);
  });

  it("does not count visible spans lacking the marker class", () => {
    const div = document.createElement("div");
    div.innerHTML = `
      <span class="visible"></span>
      <span class="some-other-class visible"></span>
    `;
    expect(countVisibleMarkers(div)).toBe(0);
  });
});

describe("clampStep", () => {
  it("clamps a value above the max down to stepCount - 1", () => {
    expect(clampStep(5, 3)).toBe(2);
  });

  it("clamps a negative value up to 0", () => {
    expect(clampStep(-1, 3)).toBe(0);
  });

  it("passes through an in-range value unchanged", () => {
    expect(clampStep(1, 3)).toBe(1);
  });

  it("returns 0 when stepCount is 0", () => {
    expect(clampStep(0, 0)).toBe(0);
  });
});
