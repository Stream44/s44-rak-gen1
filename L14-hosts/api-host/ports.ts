const PORT_PRIMITIVE = "/primitive/Port/1.0";

export function portsOf(value: unknown, out: number[] = []): number[] {
  if (!value || typeof value !== "object") return out;
  const record = value as Record<string, unknown>;
  const props = record.props as Record<string, unknown> | undefined;
  if (
    typeof record.asset === "string" &&
    record.asset.includes(PORT_PRIMITIVE) &&
    typeof props?.port === "number"
  )
    out.push(props.port);
  for (const child of Object.values(record)) portsOf(child, out);
  return out;
}
