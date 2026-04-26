export interface HostHttpRequest {
  method: string;
  url: string;
  pathname: string;
  headers: Record<string, string>;
  body?: string;
}
export interface HostResponseFrame {
  status: number;
  body?: BodyInit | null;
  contentType?: string;
  headers?: HeadersInit;
}

const wantsBody = (contentType: string | null) => !!contentType && /(json|text)/i.test(contentType);

export async function decodeHttpRequest(request: Request): Promise<HostHttpRequest> {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  const body = wantsBody(request.headers.get("content-type")) ? await request.text() : undefined;
  return {
    method: request.method,
    url: request.url,
    pathname: url.pathname,
    headers,
    ...(body === undefined ? {} : { body }),
  };
}

export function encodeHttpResponse(result: HostResponseFrame): Response {
  const headers = new Headers(result.headers ?? {});
  if (result.contentType && !headers.has("content-type"))
    headers.set("content-type", result.contentType);
  return new Response(result.body ?? null, { status: result.status, headers });
}

export default { decodeHttpRequest, encodeHttpResponse };
