from datetime import datetime
from pydantic import BaseModel, Field


class ClaimCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    ssn: str = Field(..., pattern=r"^\d{3}-\d{2}-\d{4}$")
    date_of_birth: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    amount: float = Field(..., gt=0)
    claim_type: str = Field(..., pattern=r"^(auto|home|health|life|specialty)$")
    description: str = Field(..., min_length=1, max_length=500)


class ClaimResponse(BaseModel):
    id: int
    name: str
    ssn: str
    date_of_birth: str
    amount: float
    claim_type: str
    description: str
    status: str
    created_at: datetime


class ClaimRaw(BaseModel):
    id: int
    name: str
    ssn_encrypted: str
    dob_encrypted: str
    amount_encrypted: str
    claim_type: str
    description: str
    status: str
    created_at: datetime
