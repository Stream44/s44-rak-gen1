let cachedBundle: Promise<string> | null = null;

export async function buildRuntimeBundle(): Promise<string> {
  cachedBundle ??= (async () => {
    const result = await Bun.build({
      entrypoints: [new URL("./runtime/client.ts", import.meta.url).pathname],
      target: "browser",
      format: "esm",
      minify: false,
      splitting: false,
      sourcemap: "none",
    });
    if (!result.success)
      throw new AggregateError(result.logs, "Failed to bundle ui.html.ws runtime.");
    const output = result.outputs[0];
    if (!output) throw new Error("Bun.build returned no runtime bundle output.");
    return await output.text();
  })();
  return cachedBundle;
}
