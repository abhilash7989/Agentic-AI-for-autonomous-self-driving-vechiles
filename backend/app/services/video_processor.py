import json
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


def extract_video_metadata(video_path: str, max_frames: int = 30) -> Dict[str, Any]:
    """Extract frame count, FPS, dimensions, and optional frame file paths."""
    if not HAS_CV2:
        return {"frame_count": 0, "fps": 0, "width": 0, "height": 0, "frames_saved": 0, "error": "opencv not available"}

    path = Path(video_path)
    frames_dir = path.parent.parent / "frames" / path.stem
    frames_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return {"frame_count": 0, "fps": 0, "width": 0, "height": 0, "frames_saved": 0, "error": "cannot open video"}

    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    saved_paths: List[str] = []
    step = max(1, total // max_frames) if total > 0 else 1
    idx = 0
    saved = 0

    while saved < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if idx % step == 0:
            frame_file = frames_dir / f"frame_{saved:04d}.jpg"
            cv2.imwrite(str(frame_file), frame)
            saved_paths.append(str(frame_file))
            saved += 1
        idx += 1

    cap.release()

    return {
        "frame_count": total,
        "fps": round(fps, 2),
        "width": width,
        "height": height,
        "frames_saved": len(saved_paths),
        "frame_paths": saved_paths[:5],
        "frames_dir": str(frames_dir),
    }


def analyze_image_metrics(image_path: str) -> Dict[str, float]:
    """Derive camera-like metrics from an uploaded image."""
    if not HAS_CV2:
        return {"brightness": 128.0, "contrast": 64.0, "blur_metric": 15.0}

    import numpy as np

    img = cv2.imread(image_path)
    if img is None:
        return {"brightness": 128.0, "contrast": 64.0, "blur_metric": 15.0}

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    blur_metric = float(min(50.0, laplacian_var / 10.0))

    return {
        "brightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "blur_metric": round(blur_metric, 2),
    }
