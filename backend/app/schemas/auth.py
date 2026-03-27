from pydantic import BaseModel, Field, field_validator

from app.validators import login_validation_message, password_validation_message


class RegisterRequest(BaseModel):
    login: str = Field(..., min_length=3, max_length=16)
    password: str = Field(..., min_length=10, max_length=16)

    @field_validator("login")
    @classmethod
    def login_rules(cls, v: str) -> str:
        msg = login_validation_message(v)
        if msg:
            raise ValueError(msg)
        return v

    @field_validator("password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        msg = password_validation_message(v)
        if msg:
            raise ValueError(msg)
        return v


class RegisterResponse(BaseModel):
    id: int
    login: str


class LoginRequest(BaseModel):
    login: str = Field(..., min_length=3, max_length=16)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("login")
    @classmethod
    def login_rules(cls, v: str) -> str:
        msg = login_validation_message(v)
        if msg:
            raise ValueError(msg)
        return v


class UserPublic(BaseModel):
    id: int
    login: str


class LoginResponse(BaseModel):
    message: str
    user: UserPublic


class MessageResponse(BaseModel):
    message: str
