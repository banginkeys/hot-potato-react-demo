export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

export function preflight(event) {
  if (event.httpMethod !== "OPTIONS") return null;
  return json(204, {});
}

export function parseJson(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

export function publicBaseUrl(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  return process.env.PUBLIC_SITE_URL || process.env.URL || origin || "http://localhost:5173";
}
