from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_secret_key: str
    # Optionnel : utilisé uniquement pour vérifier les anciens tokens HS256 (legacy).
    # Les nouveaux JWT Supabase sont vérifiés via JWKS (ES256/RS256), pas besoin de ce champ.
    supabase_jwt_secret: str | None = None
    cors_origins: str = "http://localhost:5173"
    soffice_bin: str = "soffice"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]
