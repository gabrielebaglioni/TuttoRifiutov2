export function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}
