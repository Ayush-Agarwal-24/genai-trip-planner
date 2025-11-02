from base64 import b64decode
from pathlib import Path
from io import BytesIO
import os

from dotenv import load_dotenv
from google import genai
from google.genai.types import GenerateContentConfig, Modality
from PIL import Image, UnidentifiedImageError

# Load .env (override ensures values win even if already set)
load_dotenv()

project = os.getenv("GCP_PROJECT_ID")
location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
model_id = os.getenv("IMAGE_MODEL", "gemini-2.5-flash-image")

if not project:
    raise RuntimeError("GCP_PROJECT_ID is missing; ensure it is set in .env or the environment.")

client = genai.Client(
    vertexai=True,
    project=project,
    location=location,
)

prompt = f"Cinematic photo of Jaipur Airport,Jaipur. Ultra-detailed, natural lighting, editorial travel style, 16:9."

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=prompt,
    config=GenerateContentConfig(
        response_modalities=[Modality.TEXT, Modality.IMAGE],
        candidate_count=1,
        safety_settings=[
            {"method": "PROBABILITY"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT"},
            {"threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        ],
    ),
)
out_dir = Path("output_folder")
out_dir.mkdir(parents=True, exist_ok=True)

for part in response.candidates[0].content.parts:
    print(part)
    if getattr(part, "text", None):
        print(part.text)
        continue

    inline = getattr(part, "inline_data", None)
    if not inline:
        continue

    data = inline.data
    if isinstance(data, str):
        data = data.encode("utf-8")
    raw = b64decode(data, validate=False)

    ext = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(getattr(inline, "mime_type", ""), ".bin")

    out_path = out_dir / f"example-image-eiffel-tower{ext}"
    with open(out_path, "wb") as f:
        f.write(raw)
    print(f"Saved: {out_path}")

    try:
        img = Image.open(BytesIO(raw))
        img.save(out_dir / "example-image-eiffel-tower-pil.png")
        print("Also wrote: example-image-eiffel-tower-pil.png")
    except UnidentifiedImageError:
        print(f"Pillow couldn't decode {inline.mime_type}; file still saved on disk.")