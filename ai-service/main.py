# main.py - image similarity service using CLIP.
# Node sends two photo file names (from the uploads folder).
# This service answers with a score from 0 to 100.

import os
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel
from transformers import CLIPModel, CLIPProcessor

# The uploads folder sits next to ai-service/
UPLOADS_DIR = Path(
    os.environ.get("UPLOADS_DIR", Path(__file__).resolve().parent.parent / "uploads")
).resolve()

MODEL_NAME = "openai/clip-vit-base-patch32"

# CLIP's raw similarity is usually between about 0.5 (different things)
# and 0.95 (same thing). We stretch that range to 0-100.
# These two numbers can be tuned after testing with real photos.
LOW = 0.50
HIGH = 0.95

print("Loading CLIP model (the first run downloads about 600 MB)...")
model = CLIPModel.from_pretrained(MODEL_NAME).eval()
processor = CLIPProcessor.from_pretrained(MODEL_NAME)
print("Model ready.")

app = FastAPI()
cache = {}  # photo -> its embedding, so each photo is processed only once


class Pair(BaseModel):
    image_a: str  # file name only, e.g. "63baf573ef1b.jpg"
    image_b: str


def find_photo(name: str) -> Path:
    # Path(name).name drops any folders, so only files inside uploads/ can be read
    path = (UPLOADS_DIR / Path(name).name).resolve()
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Photo not found: " + name)
    return path


def embed(path: Path):
    key = (str(path), path.stat().st_mtime)
    if key not in cache:
        image = Image.open(path).convert("RGB")
        inputs = processor(images=image, return_tensors="pt")
        with torch.no_grad():
            features = model.get_image_features(**inputs)
        features = features / features.norm(dim=-1, keepdim=True)
        cache[key] = features[0]
    return cache[key]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/compare")
def compare(pair: Pair):
    a = embed(find_photo(pair.image_a))
    b = embed(find_photo(pair.image_b))
    similarity = float(torch.dot(a, b))  # cosine similarity, -1 to 1
    score = (similarity - LOW) / (HIGH - LOW) * 100
    score = max(0, min(100, round(score)))
    return {"score": score, "similarity": round(similarity, 4)}