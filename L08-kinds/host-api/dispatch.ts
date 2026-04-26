import { encodeHttpResponse, type HostResponseFrame } from "./http-host-action.ts";

type PrimitiveRecord = { kind?: string };

const records = (projection: {
  primitives?: PrimitiveRecord[] | Record<string, PrimitiveRecord>;
}) =>
  Array.isArray(projection?.primitives)
    ? projection.primitives
    : Object.values(projection?.primitives ?? {});
const one = (all: PrimitiveRecord[], kind: string) => all.find((entry) => entry?.kind === kind);

export default function dispatch(
  projection: { primitives?: PrimitiveRecord[] | Record<string, PrimitiveRecord> },
  ak: { morphisms: { evaluate(id: string, input: unknown): Promise<unknown> } },
) {
  const all = records(projection),
    port = one(all, "port"),
    mounts = all.filter((entry) => entry?.kind === "mount"),
    listener = one(all, "listener"),
    drainTimeout = one(all, "drainTimeout"),
    session = one(all, "sessionStoreRef"),
    jwt = one(all, "jwtConfig"),
    openApi = one(all, "openApiAggregator");
  void [port, listener, drainTimeout];
  return {
    async handleRequest(request: Request): Promise<Response> {
      return encodeHttpResponse(
        (await ak.morphisms.evaluate("morphism://adk/apiHostRequestPipeline/1.0", {
          request,
          projection,
          mounts,
          session,
          jwt,
          openApi,
        })) as HostResponseFrame,
      );
    },
  };
}
