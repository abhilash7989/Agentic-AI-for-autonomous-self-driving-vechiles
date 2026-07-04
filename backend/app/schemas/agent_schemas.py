from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AgentStepLog(BaseModel):
    """Structured log for one step in the 6-stage agent pipeline."""
    step: str
    timestamp: float
    cycle_id: str
    inputs: Dict[str, Any] = Field(default_factory=dict)
    outputs: Dict[str, Any] = Field(default_factory=dict)
    duration_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


class DiagnosisRecord(BaseModel):
    sensor: str
    fault: str
    severity: str
    impact: str
    confidence: float = 1.0


class VerifyResult(BaseModel):
    verification_passed: bool
    fusion_confidence: float
    safety_score: float
    risk_score: float
    recovery_status: str
    fused_distance: float
    summary: str
