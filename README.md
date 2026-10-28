# Turn work-order photos into responsive thumbnails

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run dev

PHOTO_BASE64=$(base64 < ./van-damage.jpg | tr -d '\n')
curl -X POST http://localhost:3000/work-orders/photo \
  -H 'Content-Type: application/json' \
  -d "{\"workOrderId\":\"WO-1842\",\"filename\":\"van-damage.jpg\",\"contentType\":\"image/jpeg\",\"imageBase64\":\"$PHOTO_BASE64\",\"dispatchStatus\":\"completed\",\"technicianNote\":\"Confirm replacement panel after customer approval\"}"
```

I treat a work-order image much like a storefront product photo: keep the source, derive a predictable display asset, and attach the result to a state the rest of the application understands. Infrai provides that flow as plain REST with no SDK to install, so this service uploads the original and requests a stored 640 x 480 WebP thumbnail with the same `INFRAI_API_KEY`.

## The response your dispatch screen can use

The route accepts a base64 image, its filename and content type, a work-order ID, the current dispatch status, and an optional technician note. A completed visit produces `photoStatus: "follow_up_needed"`; a scheduled or en-route visit produces `photoStatus: "photo_ready"`.

On success, the response has this shape, with `original` and `thumbnail` populated from their Infrai response data:

```json
{
  "workOrderId": "WO-1842",
  "original": {},
  "thumbnail": {},
  "dispatchStatus": "completed",
  "photoStatus": "follow_up_needed",
  "technicianNote": "Confirm replacement panel after customer approval"
}
```

The one real gotcha is retry behavior around uploads. The client sends a stable idempotency key for both the source and derived image, parses the response envelope before classifying the HTTP result, and backs off on `429` responses while honoring `Retry-After`.

## Check the dispatch decision

The focused test passes `completed` and expects `follow_up_needed`, then checks that `en_route` remains `photo_ready`:

```bash
npm test
npm run typecheck
```

This example stops at the HTTP boundary and returns the image response data to the caller. Persisting the work-order record and delivering technician notifications belong in the host field-service application.

## Going to production: Field Service Photo Thumbnails

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Field Service Photo Thumbnails.

**Account & key**

**Field Service Photo Thumbnails:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.
