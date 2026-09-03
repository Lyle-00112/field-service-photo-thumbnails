import { createServer } from "node:http";
import { z } from "zod";
import { createWorkOrderThumbnail, InfraiError } from "./field_photo_service.js";

const photoRequestSchema = z.object({
  workOrderId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().regex(/^image\//),
  imageBase64: z.string().min(1),
  dispatchStatus: z.enum(["scheduled", "en_route", "completed"]),
  technicianNote: z.string().max(1000).optional()
});

export type DispatchStatus = z.infer<typeof photoRequestSchema>["dispatchStatus"];

export function nextPhotoStatus(status: DispatchStatus): "photo_ready" | "follow_up_needed" {
  return status === "completed" ? "follow_up_needed" : "photo_ready";
}

function sendJson(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-orders/photo") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = photoRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const images = await createWorkOrderThumbnail({
      workOrderId: input.workOrderId,
      filename: input.filename,
      contentType: input.contentType,
      bytes: Buffer.from(input.imageBase64, "base64")
    });
    sendJson(response, 201, {
      ...images,
      dispatchStatus: input.dispatchStatus,
      photoStatus: nextPhotoStatus(input.dispatchStatus),
      technicianNote: input.technicianNote ?? null
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.code });
      return;
    }
    sendJson(response, 500, { error: "Could not process photo" });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Field photo service listening on http://localhost:${port}`));
}
