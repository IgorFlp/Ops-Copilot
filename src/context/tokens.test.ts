import assert from "node:assert/strict";
import test from "node:test";
import { estimateTokens } from "./tokens.js";

test("estimates tokens by rounding down one per four Unicode code points", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abc"), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcdefgh"), 2);
  assert.equal(estimateTokens("abcdefghi"), 2);
});

test("counts supplementary Unicode characters as one code point", () => {
  assert.equal(estimateTokens("😀😀😀"), 0);
  assert.equal(estimateTokens("😀😀😀😀"), 1);
  assert.equal(estimateTokens("áéíó"), 1);
});
