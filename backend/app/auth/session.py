from itsdangerous import URLSafeTimedSerializer

from app.config import settings

SESSION_COOKIE_NAME = "tc_session"
SERIALIZER_SALT = "tc-auth-v1"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt=SERIALIZER_SALT)


def create_session_token(user_id: int) -> str:
    return _serializer().dumps({"uid": user_id})


def decode_session_token(token: str) -> int:
    data = _serializer().loads(token, max_age=settings.session_max_age_seconds)
    return int(data["uid"])
