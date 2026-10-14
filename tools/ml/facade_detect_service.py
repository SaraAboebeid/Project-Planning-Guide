"""Facade defect-detection inference service (runs on the HOST, using the torch
env + the trained model from the ML project). The app's backend proxies to it
at /api/facade-detect.

    python tools/ml/facade_detect_service.py           # serves on :8021

Config (env):
    FACADE_ML_ROOT   default C:/Users/saraabo/Desktop/ML  (the ML repo)
    FACADE_MODEL     default outputs/mbdd2025_pretrained/best.pt  (best_score 0.77)
    FACADE_ML_PORT   default 8021  (not 8020: another local project's server took that)

POST /detect  (raw image bytes, ?threshold=0.5&tiles=0) -> {detections:[{box,label,score}], width, height}

tiles=1 also runs the model on overlapping crops of the photo. Meant for whole-
facade Street View captures: the model was trained on close-up drone photos, and
a whole building in ~500 px leaves defects a few pixels wide. Each crop is
resized up to the model's 800 px input, so the wall is seen 2-3x closer. Boxes
are mapped back to whole-image pixels and merged with the whole-image pass, so
the caller still gets one set of boxes on the original image.
"""
import io
import os
import sys
from pathlib import Path

ML_ROOT = Path(os.environ.get("FACADE_ML_ROOT", r"C:/Users/saraabo/Desktop/ML"))
MODEL_REL = os.environ.get("FACADE_MODEL", "outputs/mbdd2025_pretrained/best.pt")
PORT = int(os.environ.get("FACADE_ML_PORT", "8021"))

sys.path.insert(0, str(ML_ROOT / "src"))          # make the facade_ml package importable
import numpy as np
import torch
from PIL import Image
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from facade_ml.data.voc import VOC_CLASSES          # ("crack","leakage","abscission","corrosion","bulge")
from facade_ml.models.detection import build_detection_model


def _load_model():
    ckpt_path = ML_ROOT / MODEL_REL
    ckpt = torch.load(ckpt_path, map_location="cpu")
    model = build_detection_model(num_classes=ckpt["num_classes"], fpn_v2=bool(ckpt.get("fpn_v2", False)))
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    print(f"[facade-ml] loaded {ckpt_path.name} (num_classes={ckpt['num_classes']}, "
          f"best_score={ckpt.get('best_score')})")
    return model


MODEL = _load_model()
app = FastAPI(title="Facade defect detection")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _label(index: int) -> str:
    return VOC_CLASSES[index - 1] if 1 <= index <= len(VOC_CLASSES) else f"class_{index}"


def _tensor(image: Image.Image) -> torch.Tensor:
    arr = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    return torch.from_numpy(np.transpose(arr, (2, 0, 1)).copy())


@torch.no_grad()
def _detect(image: Image.Image):
    return MODEL([_tensor(image)])[0]


TILE_MIN, TILE_MAX, TILE_OVERLAP, TILE_BATCH = 256, 640, 0.25, 4
TILE_FRAC = float(os.environ.get("FACADE_TILE_FRAC", "0.5"))   # crop side as a share of the short side


def _tile_windows(w: int, h: int) -> list[tuple[int, int, int]]:
    """Square crops (x, y, size) covering the image with overlap; [] when the
    image is already small enough that the whole-image pass sees it up close."""
    if min(w, h) < TILE_MIN:                        # tiny capture: whole-image pass already zooms it
        return []
    size = max(TILE_MIN, min(TILE_MAX, round(min(w, h) * TILE_FRAC)))
    size = min(size, w, h)
    if max(w, h) <= size * 1.25:
        return []
    step = max(1, round(size * (1 - TILE_OVERLAP)))
    def starts(total: int) -> list[int]:
        s = list(range(0, max(1, total - size) + 1, step))
        if s[-1] + size < total:
            s.append(total - size)                  # last crop flush with the edge
        return s
    return [(x, y, size) for y in starts(h) for x in starts(w)]


@torch.no_grad()
def _detect_tiled(image: Image.Image):
    """Whole-image pass + overlapping crops, merged per class with NMS."""
    from torchvision.ops import batched_nms
    full = _detect(image)
    boxes, labels, scores = [full["boxes"]], [full["labels"]], [full["scores"]]
    wins = _tile_windows(image.width, image.height)
    for i in range(0, len(wins), TILE_BATCH):
        chunk = wins[i:i + TILE_BATCH]
        preds = MODEL([_tensor(image.crop((x, y, x + s, y + s))) for x, y, s in chunk])
        for (x, y, _), p in zip(chunk, preds):
            boxes.append(p["boxes"] + torch.tensor([x, y, x, y], dtype=p["boxes"].dtype))
            labels.append(p["labels"]); scores.append(p["scores"])
    b, l, s = torch.cat(boxes), torch.cat(labels), torch.cat(scores)
    keep = batched_nms(b, s, l, 0.5)
    return {"boxes": b[keep], "labels": l[keep], "scores": s[keep]}, len(wins)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_REL, "classes": list(VOC_CLASSES)}


@app.post("/detect")
async def detect(request: Request, threshold: float = 0.5, tiles: int = 0):
    data = await request.body()
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        return {"error": f"could not read image: {e}", "detections": []}
    n_tiles = 0
    if tiles:
        pred, n_tiles = _detect_tiled(img)
    else:
        pred = _detect(img)
    dets = [
        {"box": [round(float(v), 1) for v in box], "label": _label(int(lbl)), "score": round(float(sc), 3)}
        for box, lbl, sc in zip(pred["boxes"], pred["labels"], pred["scores"]) if float(sc) >= threshold
    ]
    dets.sort(key=lambda d: d["score"], reverse=True)
    return {"detections": dets, "width": img.width, "height": img.height, "classes": list(VOC_CLASSES),
            "tiles": n_tiles}


if __name__ == "__main__":
    import uvicorn
    print(f"[facade-ml] serving on http://0.0.0.0:{PORT}  (POST /detect)")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
