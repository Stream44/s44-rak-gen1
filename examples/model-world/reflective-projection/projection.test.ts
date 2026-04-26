import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("projection yaml carries the reflective projection id and body contract", () => {
  const doc = Bun.YAML.parse(
    readFileSync(new URL("./projection.yaml", import.meta.url), "utf-8"),
  ) as { id: string; body: Array<{ component: string }> };
  expect(doc.id).toBe("projection://adk/reflective-model/1.0");
  expect(doc.body[0]?.component).toBe("Context");
});
