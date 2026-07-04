import json
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..dataset_loader import DatasetLoader
from ..models import SensorUpload
from ..services.upload_storage import active_upload_context, upload_storage
from ..services.video_processor import analyze_image_metrics, extract_video_metadata

router = APIRouter(prefix="/api/sensor-input", tags=["Sensor Input Center"])
dataset_loader = DatasetLoader()

# Callback set by main.py to queue CSV tracks into simulation
_queue_csv_track = None


def set_csv_track_callback(fn):
    global _queue_csv_track
    _queue_csv_track = fn


def _record_upload(
    db: Session,
    upload_type: str,
    sensor_type: str,
    filename: str,
    storage_path: str,
    frame_count: int,
    metadata: dict,
) -> SensorUpload:
    row = SensorUpload(
        upload_type=upload_type,
        filename=filename,
        storage_path=storage_path,
        sensor_type=sensor_type,
        frame_count=frame_count,
        metadata_json=json.dumps(metadata),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image (JPEG, PNG, etc.).")

    content = await file.read()
    saved = upload_storage.save_bytes(content, file.filename or "image.jpg", "image", "Camera")
    metrics = analyze_image_metrics(saved["storage_path"])

    row = _record_upload(
        db, "image", "Camera", file.filename or "image.jpg",
        saved["storage_path"], 1, {**saved["metadata"], "camera_metrics": metrics},
    )

    active_upload_context["active_image_id"] = row.id
    active_upload_context["active_image_url"] = saved["relative_url"]
    active_upload_context["camera_metrics"] = metrics

    return {
        "status": "success",
        "id": row.id,
        "url": saved["relative_url"],
        "camera_metrics": metrics,
        "message": f"Image uploaded and analyzed ({file.filename}).",
    }


@router.post("/video")
async def upload_video(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video (MP4, AVI, etc.).")

    content = await file.read()
    saved = upload_storage.save_bytes(content, file.filename or "video.mp4", "video", "Camera")
    video_meta = extract_video_metadata(saved["storage_path"])

    row = _record_upload(
        db, "video", "Camera", file.filename or "video.mp4",
        saved["storage_path"], video_meta.get("frames_saved", 0),
        {**saved["metadata"], **video_meta},
    )

    active_upload_context["active_video_id"] = row.id
    active_upload_context["active_video_url"] = saved["relative_url"]
    active_upload_context["video_metadata"] = video_meta

    return {
        "status": "success",
        "id": row.id,
        "url": saved["relative_url"],
        "video_metadata": video_meta,
        "message": f"Video uploaded — {video_meta.get('frames_saved', 0)} frames extracted.",
    }


@router.post("/csv")
async def upload_sensor_csv(
    file: UploadFile = File(...),
    sensor_type: str = Form("multi"),
    db: Session = Depends(get_db),
):
    valid = {"Camera", "LiDAR", "Radar", "GPS", "IMU", "multi"}
    if sensor_type not in valid:
        raise HTTPException(status_code=400, detail=f"sensor_type must be one of {valid}")

    content = await file.read()
    saved = upload_storage.save_bytes(content, file.filename or "data.csv", "csv", sensor_type)

    try:
        decoded = content.decode("utf-8")
        track = dataset_loader.parse_csv_upload(decoded)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {str(e)}")

    if _queue_csv_track:
        _queue_csv_track(track, sensor_type, file.filename or "data.csv")

    row = _record_upload(
        db, "csv", sensor_type, file.filename or "data.csv",
        saved["storage_path"], len(track),
        {**saved["metadata"], "sensor_type": sensor_type, "rows": len(track)},
    )

    active_upload_context["last_csv_upload_id"] = row.id

    return {
        "status": "success",
        "id": row.id,
        "sensor_type": sensor_type,
        "frames_queued": len(track),
        "message": f"CSV uploaded for {sensor_type} — {len(track)} frames queued.",
    }


@router.get("/list")
def list_uploads(upload_type: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    query = db.query(SensorUpload)
    if upload_type:
        query = query.filter(SensorUpload.upload_type == upload_type)
    rows = query.order_by(SensorUpload.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "upload_type": r.upload_type,
            "sensor_type": r.sensor_type,
            "filename": r.filename,
            "frame_count": r.frame_count,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "metadata": json.loads(r.metadata_json) if r.metadata_json else {},
        }
        for r in rows
    ]


@router.get("/{upload_id}")
def get_upload(upload_id: int, db: Session = Depends(get_db)):
    row = db.query(SensorUpload).filter(SensorUpload.id == upload_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Upload not found.")
    return {
        "id": row.id,
        "upload_type": row.upload_type,
        "sensor_type": row.sensor_type,
        "filename": row.filename,
        "storage_path": row.storage_path,
        "frame_count": row.frame_count,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "metadata": json.loads(row.metadata_json) if row.metadata_json else {},
    }


@router.delete("/{upload_id}")
def delete_upload(upload_id: int, db: Session = Depends(get_db)):
    row = db.query(SensorUpload).filter(SensorUpload.id == upload_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Upload not found.")
    upload_storage.delete_file(row.storage_path)
    db.delete(row)
    db.commit()
    return {"status": "success", "message": f"Deleted upload {upload_id}."}
