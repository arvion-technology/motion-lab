import test from "node:test";
import assert from "node:assert/strict";
import {
  EASINGS, parseEasing, sampleEasing, clampDuration, formatDuration, staggerDelays,
  shouldAnimate, REDUCED_MOTION_CSS, DURATION_MIN, DURATION_MAX, DURATION_DEFAULT,
} from "../src/easing.js";
import {
  RECIPES, RECIPE_COUNT, CATEGORIES, getRecipe, recipesByCategory, categoryMeta,
  buildSnippet, recipesUsing,
} from "../src/recipes.js";

/* ------------------------------------------------------------- easing maths */

test("EASINGS ids are unique and every curve parses", () => {
  assert.equal(new Set(EASINGS.map((easing) => easing.id)).size, EASINGS.length);
  for (const easing of EASINGS) {
    assert.notEqual(parseEasing(easing.value), null, easing.id);
  }
});

test("parseEasing accepts cubic-bezier and linear, rejects the rest", () => {
  assert.deepEqual(parseEasing("cubic-bezier(0.22, 0.61, 0.36, 1)"), {
    kind: "bezier", points: [0.22, 0.61, 0.36, 1],
  });
  assert.deepEqual(parseEasing("linear"), { kind: "linear" });
  assert.equal(parseEasing("ease-in-out"), null);
  assert.equal(parseEasing("cubic-bezier(0.2, 0.3)"), null);
  assert.equal(parseEasing("cubic-bezier(1.4, 0, 0.2, 1)"), null, "x must stay in 0..1");
  assert.equal(parseEasing(42), null);
});

test("sampleEasing pins both endpoints", () => {
  assert.equal(sampleEasing("cubic-bezier(0.22, 0.61, 0.36, 1)", 0), 0);
  assert.equal(sampleEasing("cubic-bezier(0.22, 0.61, 0.36, 1)", 1), 1);
  assert.equal(sampleEasing("linear", 0.25), 0.25);
});

test("sampleEasing is continuous and generally advancing", () => {
  const values = Array.from({ length: 11 }, (_, i) => sampleEasing("cubic-bezier(0.22, 0.61, 0.36, 1)", i / 10));
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] >= values[i - 1] - 1e-9, `sample ${i} went backwards`);
  }
  assert.ok(values[5] > 0.5, "the standard curve front-loads its motion");
  assert.ok(values.every((value) => value >= 0 && value <= 1.05));
});

test("spring easing overshoots above 1", () => {
  const values = Array.from({ length: 21 }, (_, i) => sampleEasing("cubic-bezier(0.34, 1.56, 0.64, 1)", i / 20));
  assert.ok(Math.max(...values) > 1, "spring should overshoot");
});

test("durations clamp to the control range", () => {
  assert.equal(clampDuration(600), 600);
  assert.equal(clampDuration(10), DURATION_MIN);
  assert.equal(clampDuration(99999), DURATION_MAX);
  assert.equal(clampDuration("900"), 900);
  assert.equal(clampDuration("nope"), DURATION_DEFAULT);
});

test("formatDuration is readable in the code panel", () => {
  assert.equal(formatDuration(220), "220ms");
  assert.equal(formatDuration(1000), "1s");
  assert.equal(formatDuration(1400), "1.4s");
});

test("stagger delays cap the total so long lists still arrive", () => {
  assert.deepEqual(staggerDelays(4, 60), [0, 60, 120, 180]);
  const many = staggerDelays(40, 60);
  assert.equal(many.length, 40);
  assert.ok(many.at(-1) <= 600, `last delay ${many.at(-1)} exceeded the cap`);
  assert.deepEqual(staggerDelays(0), []);
});

test("reduced motion is a global decision, not per component", () => {
  assert.equal(shouldAnimate(false, false), true);
  assert.equal(shouldAnimate(true, false), false);
  assert.equal(shouldAnimate(false, true), false);
  assert.match(REDUCED_MOTION_CSS, /prefers-reduced-motion: reduce/);
  assert.match(REDUCED_MOTION_CSS, /animation-duration: 0\.001ms/);
});

/* ------------------------------------------------------------- recipes */

test("the lab ships at least twenty recipes", () => {
  assert.ok(RECIPE_COUNT >= 20);
  assert.equal(RECIPE_COUNT, 22);
  assert.equal(new Set(RECIPES.map((recipe) => recipe.id)).size, RECIPE_COUNT);
});

test("every category has at least three recipes", () => {
  assert.equal(CATEGORIES.length, 6);
  for (const category of CATEGORIES) {
    assert.ok(recipesByCategory(category.id).length >= 3, `${category.id} has too few recipes`);
    assert.equal(categoryMeta(category.id).name, category.name);
  }
  assert.equal(recipesByCategory("all").length, RECIPE_COUNT);
});

test("every recipe has copyable CSS, a trigger and an honest note", () => {
  for (const item of RECIPES) {
    assert.ok(item.name.length > 3, item.id);
    assert.ok(item.summary.length > 40, item.id);
    assert.ok(/transition|animation/.test(item.css), `${item.id} has no transition or animation`);
    assert.ok(item.css.includes("var(--motion") || /\d+ms|\d+s/.test(item.css), `${item.id} has no timing`);
    assert.ok(item.trigger.length > 8, `${item.id} trigger`);
    assert.ok(item.note.length > 40, `${item.id} note`);
    assert.ok(item.keywords.length >= 2, `${item.id} keywords`);
  }
});

test("snippets expose the shared timing controls", () => {
  const smooth = RECIPES.filter((item) => item.css.includes("var(--motion-dur)"));
  assert.ok(smooth.length >= 15, `only ${smooth.length} recipes use the shared duration`);
  const snippet = buildSnippet(getRecipe("fade-up"), {
    durationMs: 420,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  });
  assert.ok(snippet.includes("420ms"));
  assert.ok(snippet.includes("cubic-bezier(0.16, 1, 0.3, 1)"));
  assert.ok(!snippet.includes("var(--motion-dur)"));
});

test("recipes never reference a remote asset", () => {
  for (const item of RECIPES) {
    assert.ok(!/https?:\/\//.test(item.css), `${item.id} references a remote asset`);
  }
});

test("lookup and keyword search behave", () => {
  assert.equal(getRecipe("skeleton-shimmer").category, "loading");
  assert.equal(getRecipe("nope"), null);
  assert.equal(categoryMeta("nope"), null);
  const hover = recipesUsing("hover");
  assert.ok(hover.some((item) => item.id === "magnetic-button"));
  assert.ok(hover.some((item) => item.id === "shine-sweep"));
  assert.deepEqual(recipesByCategory("nope"), []);
});
