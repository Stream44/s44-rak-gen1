export function interpolate(template: string, scope: Record<string, unknown>): string {
  return template.replaceAll(/\$\{([^}]+)\}/g, (_, raw) => {
    const expr = String(raw).trim();
    const lower = expr.match(/^(.+)\.toLowerCase\(\)$/);
    const cap = expr.match(/^capitalize\((.+)\)$/);
    const path = (lower?.[1] ?? cap?.[1] ?? expr).replaceAll(/\[(\d+)\]/g, ".$1");
    let value: unknown = scope;
    for (const part of path.split(".")) {
      if (!part) continue;
      if (value == null || !(part in Object(value))) {
        throw new Error(`UnfoldingEngine: rule interpolation failed — unknown variable '${expr}'`);
      }
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value !== "string") value = String(value);
    return lower
      ? String(value).toLowerCase()
      : cap
        ? String(value).charAt(0).toUpperCase() + String(value).slice(1)
        : String(value);
  });
}
