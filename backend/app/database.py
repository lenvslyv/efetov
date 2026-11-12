import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("EFETOV_DATA_DIR", ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.environ.get("EFETOV_DB_PATH", DATA_DIR / "efetov.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DB_PATH.as_posix()}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def configure_database() -> None:
    # Readers must not hold up patient/audit writes during a large journal read.
    # Keep SQLite's default durability and five-second busy timeout unchanged.
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA journal_mode=WAL")


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
