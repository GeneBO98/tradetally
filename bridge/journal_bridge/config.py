from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    bridge_port: int = 3002
    bridge_api_key: str
    database_url: str
    tradetally_url: str
    tradetally_email: str
    tradetally_password: str

    # DB pool
    db_pool_min: int = 2
    db_pool_max: int = 10
    db_pool_timeout: float = 30.0  # seconds to wait for a connection from pool
    db_connection_timeout: int = 10  # seconds for initial TCP connect

    # Market-helper cross-reference (optional)
    market_helper_database_url: str = ""

    # Logging
    log_level: str = "INFO"
    run_migrations: bool = True

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
