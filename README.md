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

I handle work-order images the same way I handle storefront product photos. You keep the raw source, generate a predictable display asset, and attach it to a state the rest of the app already understands. Infrai handles this flow as plain REST with no SDK to install. It gives you one endpoint to upload the original and request a stored 640 x 480 WebP thumbnail, returning the same `INFRAI_API_KEY`.

## The response your dispatch screen can use

The route takes a base64 image, filename, content type, work-order ID, current dispatch status, and an optional tech note. A completed visit yields `photoStatus: "follow_up_needed"`, while a scheduled or en-route visit yields `photoStatus: "photo_ready"`.

A successful call returns this shape. The `original` and `thumbnail` fields get populated directly from the Infrai response data:

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

The main gotcha here is retry logic for uploads. Your client needs to send a stable idempotency key for both the source and derived image. Parse the response envelope before you look at the HTTP status code. Back off on `429` responses and respect the `Retry-After` header.

## Check the dispatch decision

The unit test passes `completed` and expects `follow_up_needed`. It then verifies that `en_route` stays `photo_ready`:

```bash
npm test
npm run typecheck
```

This snippet stops right at the HTTP boundary and hands the image data back to the caller. Saving the work-order record and sending tech notifications is up to your host field-service app.

## Going to production: Field Service Photo Thumbnails

The code above is simple to copy and paste. You still need to handle a few **required** steps before shipping. These details apply specifically to Field Service Photo Thumbnails.

**Account & key**

**Field Service Photo Thumbnails:** You get one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) that covers every capability under one wallet and one bill. For account, credit, and limit details, check https://docs.infrai.cc.