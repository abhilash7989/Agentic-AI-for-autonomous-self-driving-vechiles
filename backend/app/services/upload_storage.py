import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads"

SENSOR_TYPES = {"Camera", "LiDAR", "Radar", "GPS", "IMU", "multi"}
UPLOAD_TYPES = {"image", "video", "csv"}


def _safe_filename(name: str) -> str:
    return re.sub(r"[^\w.\-]", "_", name)[:120]


class UploadStorage:
    def __init__(self):
        self.root = UPLOAD_ROOT
        for sub in ("images", "videos", "csv", "frames"):
            (self.root / sub).mkdir(parents=True, exist_ok=True)

    def subdir_for(self, upload_type: str) -> Path:
        mapping = {"image": "images", "video": "videos", "csv": "csv"}
        return self.root / mapping.get(upload_type, "csv")

    def save_bytes(
        self,
        content: bytes,
        original_filename: str,
        upload_type: str,
        sensor_type: str = "multi",
        extra_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if upload_type not in UPLOAD_TYPES:
            raise ValueError(f"Invalid upload_type: {upload_type}")
        if sensor_type not in SENSOR_TYPES:
            raise ValueError(f"Invalid sensor_type: {sensor_type}")

        uid = str(uuid.uuid4())[:8]
        safe_name = _safe_filename(original_filename)
        stored_name = f"{uid}_{safe_name}"
        dest = self.subdir_for(upload_type) / stored_name
        dest.write_bytes(content)

        metadata = {
            "original_filename": original_filename,
            "stored_filename": stored_name,
            "size_bytes": len(content),
            **(extra_metadata or {}),
        }

        subdir_map = {"image": "images", "video": "videos", "csv": "csv"}
        subdir = subdir_map.get(upload_type, "csv")

        return {
            "storage_path": str(dest),
            "stored_filename": stored_name,
            "relative_url": f"/uploads/{subdir}/{stored_name}",
            "metadata": metadata,
        }

    def resolve_path(self, storage_path: str) -> Path:
        path = Path(storage_path).resolve()
        if not str(path).startswith(str(self.root.resolve())):
            raise ValueError("Invalid storage path")
        return path

    def delete_file(self, storage_path: str) -> bool:
        path = self.resolve_path(storage_path)
        if path.exists():
            path.unlink()
            return True
        return False


# Shared active upload context for dashboard / simulation
active_upload_context: Dict[str, Any] = {
    "active_image_id": None,
    "active_image_url": None,
    "active_video_id": None,
    "active_video_url": None,
    "last_csv_upload_id": None,
}

upload_storage = UploadStorage()
