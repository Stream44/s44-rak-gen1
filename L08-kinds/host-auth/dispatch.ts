import { encodeHttpResponse } from "../host-api/http-host-action.ts";

type HostAuthResult = { kind?: string };

export default function dispatch(
  projection: unknown,
  ak: { morphisms: { evaluate(id: string, input: unknown): Promise<unknown> } },
) {
  return {
    async handleRequest(request: Request): Promise<Response> {
      const result = (await ak.morphisms.evaluate(
        "morphism://adk.example/host-auth/hostAuthPipeline/1.0",
        { request, projection },
      )) as HostAuthResult;
      return encodeHttpResponse({
        status: result?.kind === "rejected" ? 403 : 200,
        body: JSON.stringify(result),
        contentType: "application/json",
      });
    },
  };
}
