import assert from "node:assert/strict";
import test from "node:test";
import { nextPhotoStatus } from "../src/dispatch_route.js";

test("a completed visit flags the uploaded photo for technician follow-up", () => {
  assert.equal(nextPhotoStatus("completed"), "follow_up_needed");
  assert.equal(nextPhotoStatus("en_route"), "photo_ready");
});
