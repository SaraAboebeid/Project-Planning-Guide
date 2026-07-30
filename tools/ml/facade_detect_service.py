"""Facade defect-detection inference service (runs on the HOST, using the torch
env + the trained model from the ML project). The app's backend proxies to it
at /api/facade-detect.

    python tools/ml/facade_detect_service.py           # serves on :8020

Config (env):
    FACADE_ML_ROOT   default C:/Users/saraabo/Desktop/ML  (the ML repo)
    FACADE_MODEL     default outputs/mbdd2025_pretrained/best.pt  (best_score 0.77)
    FACADE_ML_PORT   default 8020

POST /detect  (raw image bytes, ?threshold=0.5) -> {detections:[{box,label,score}], width, height}
"""
import io
import os
import sys
from pathlib import Path

ML_ROOT = Path(os.environ.get("FACADE_ML_ROOT", r"C:/Users/saraabo/Desktop/ML"))
MODEL_REL = os.environ.get("FACADE_MODEL", "outputs/mbdd2025_pretrained/best.pt")
PORT = int(os.environ.get("FACADE_ML_PORT", "8020"))

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


@torch.no_grad()
def _detect(image: Image.Image):
    arr = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    tensor = torch.from_numpy(np.transpose(arr, (2, 0, 1)).copy())
    return MODEL([tensor])[0]


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_REL, "classes": list(VOC_CLASSES)}


@app.post("/detect")
async def detect(request: Request, threshold: float = 0.5):
    data = await request.body()
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        return {"error": f"could not read image: {e}", "detections": []}
    pred = _detect(img)
    dets = [
        {"box": [round(float(v), 1) for v in box], "label": _label(int(lbl)), "score": round(float(sc), 3)}
        for box, lbl, sc in zip(pred["boxes"], pred["labels"], pred["scores"]) if float(sc) >= threshold
    ]
    dets.sort(key=lambda d: d["score"], reverse=True)
    return {"detections": dets, "width": img.width, "height": img.height, "classes": list(VOC_CLASSES)}


if __name__ == "__main__":
    import uvicorn
    print(f"[facade-ml] serving on http://0.0.0.0:{PORT}  (POST /detect)")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
