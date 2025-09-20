import base64
from io import BytesIO
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from PIL import Image
import google.genai as genai
from google.genai import types
import os
from main import app

API_PREFIX = "/api/v1"
PROJECT_ID = os.getenv("GCP_PROJECT_ID")
GCP_GLOBAL_LOCATION = os.getenv("GCP_GLOBAL_LOCATION", "global")

router = APIRouter()

class ImageGenerationRequest(BaseModel):
    prompt: str

def _client() -> genai.Client:
    return genai.Client(vertexai=True, project=PROJECT_ID, location=GCP_GLOBAL_LOCATION)

def _text_and_first_image_from_stream(stream) -> tuple[str, bytes | None]:
    texts = []
    img_bytes = None
    for chunk in stream:
        if getattr(chunk, "text", None):
            texts.append(chunk.text)
        if getattr(chunk, "candidates", None):
            for part in getattr(chunk.candidates[0].content, "parts", []):
                inline = getattr(part, "inline_data", None)
                if inline and getattr(inline, "data", None) and img_bytes is None:
                    img_bytes = inline.data
    return ("".join(texts), img_bytes)

def _to_jpeg_data_url(image_bytes: bytes) -> tuple[str, bytes]:
    img = Image.open(BytesIO(image_bytes))
    img = img.convert("RGB")
    img = img.resize((1024, 1024)) if max(img.size) > 1024 else img
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    jpeg_bytes = buf.getvalue()
    b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}", jpeg_bytes

@router.post(f"{API_PREFIX}/generate-image")
def generate_image(request: ImageGenerationRequest):
    try:
        client = _client()
        stream = client.models.generate_content_stream(
            model="gemini-2.5-flash-image-preview",
            contents=[
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=request.prompt)],
                ),
            ],
            config=types.GenerateContentConfig(
                temperature=1,
                top_p=0.95,
                max_output_tokens=32768,
                response_modalities=["TEXT", "IMAGE"],
                safety_settings=[
                    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
                    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
                    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
                    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF"),
                ],
            ),
        )

        model_text, img_bytes = _text_and_first_image_from_stream(stream)
        if not img_bytes:
            return JSONResponse(
                {"error": "Image generation failed: no image in stream", "model_text": model_text},
                status_code=500,
            )

        data_url, jpeg_bytes = _to_jpeg_data_url(img_bytes)
        return JSONResponse({
            "image": {"data_url": data_url, "mime_type": "image/jpeg", "size": len(jpeg_bytes)},
            "model_text": model_text or "",
        })

    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)


from pathlib import Path
from uuid import uuid4
from datetime import datetime
import base64
import mimetypes

from fastapi import Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel

class SimpleImageRequest(BaseModel):
    prompt: str
    filename: str | None = None

GEN_DIR = (Path(__file__).resolve().parent / "generated")
GEN_DIR.mkdir(parents=True, exist_ok=True)

@app.post(f"{API_PREFIX}/test-image-stream")
def test_image_stream(req: SimpleImageRequest = Body(...)):
    try:
        client = _client()
        stream = client.models.generate_content_stream(
            model="gemini-2.5-flash-image-preview",
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=req.prompt)])],
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                temperature=1,
                top_p=0.95,
                max_output_tokens=32768,
                safety_settings=[
                    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
                    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
                    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
                    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF"),
                ],
            ),
        )

        text_buf = []
        file_path = None
        f = None
        bytes_written = 0
        mime = None

        for chunk in stream:
            if getattr(chunk, "text", None):
                text_buf.append(chunk.text)
            if getattr(chunk, "candidates", None):
                parts = getattr(chunk.candidates[0].content, "parts", []) or []
                for p in parts:
                    inline = getattr(p, "inline_data", None)
                    if inline and getattr(inline, "data", None):
                        data = inline.data
                        if isinstance(data, str):
                            data = base64.b64decode(data)
                        if mime is None:
                            mime = getattr(inline, "mime_type", "image/jpeg")
                            base = req.filename or f"img-{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}-{uuid4().hex[:6]}"
                            ext = (mimetypes.guess_extension(mime) or ".jpeg").lstrip(".")
                            file_path = GEN_DIR / f"{base}.{ext}"
                            f = open(file_path, "ab")
                        if f:
                            f.write(data)
                            bytes_written += len(data)

        if f:
            f.close()

        if not file_path or not file_path.exists():
            return JSONResponse({"ok": False, "error": "no image bytes returned", "model_text": "".join(text_buf)}, status_code=500)

        return JSONResponse({
            "ok": True,
            "prompt": req.prompt,
            "model_text": "".join(text_buf),
            "file": {
                "path": str(file_path),
                "mime_type": mime or "application/octet-stream",
                "size": bytes_written
            }
        })
    except Exception as exc:
        logger.error("test_image_stream failed: %s", exc, exc_info=True)
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)
