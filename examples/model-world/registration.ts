import type { ExampleRegistrationContext } from "../../L15-cli/commands/example-registry.ts";

export function register(registry: ExampleRegistrationContext): void {
  registry.addAlias("model-world-engine", "projection-engine");
  registry.addAlias("reflective-projection", "reflective-projection");
}
