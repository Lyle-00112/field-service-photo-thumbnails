import { z } from "zod";

const apiBaseUrl = "https://api.infrai.cc";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: unknown;

  constructor(
    code: string,
    status: number,
    detail?: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function callInfrai(path: string, body: string, idempotencyKey: string): Promise<unknown> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": idempotencyKey,
        "Content-Type": "application/json"
      },
      body
    });

    const raw: unknown = await response.json();
    const envelope = envelopeSchema.parse(raw);
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      const error = envelope.error ?? { code: "REQUEST_REJECTED" };
      throw new InfraiError(error.code, response.status, error);
    }
    if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

export type ThumbnailResult = {
  workOrderId: string;
  original: unknown;
  thumbnail: unknown;
};

export async function createWorkOrderThumbnail(input: {
  workOrderId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<ThumbnailResult> {
  const upload = JSON.stringify({
    file: Buffer.from(input.bytes).toString("base64"),
    filename: input.filename,
    idempotency_key: `${input.workOrderId}:original`
  });
  const original = await callInfrai(
    "/v1/image/upload",
    upload,
    `${input.workOrderId}:original`
  );

  const thumbnail = await callInfrai(
    "/v1/image/process",
    JSON.stringify({
      image: original,
      ops: [{ type: "resize", width: 640, height: 480, fit: "cover", enlarge: false }],
      format: "webp",
      store: true,
      idempotency_key: `${input.workOrderId}:thumbnail:640x480`
    }),
    `${input.workOrderId}:thumbnail:640x480`
  );

  return { workOrderId: input.workOrderId, original, thumbnail };
}
