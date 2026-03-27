from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
.
    database_url: str = "postgresql+asyncpg://teleconsult:teleconsult@localhost:5433/teleconsult"
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    bcrypt_rounds: int = 12
    session_secret: str = "dev-only-set-SESSION_SECRET-in-production"
    session_max_age_seconds: int = 7 * 24 * 60 * 60
    cookie_secure: bool = False


settings = Settings()
