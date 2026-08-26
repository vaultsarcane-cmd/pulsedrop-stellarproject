// Vitest setup: reset the DOM container before each test.
import { beforeEach } from "vitest";

beforeEach(() => {
  document.body.innerHTML = "";
});
