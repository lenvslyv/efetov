import hmac
import hashlib
import os
from datetime import datetime, timedelta, timezone

import jwt

JWT_SECRET = os.environ.get("EFETOV_JWT_SECRET", "efetov-demo-secret")
JWT_ALG = "HS256"
JWT_HOURS = 12
IDLE_TIMEOUT = timedelta(minutes=15)
SESSION_EXPIRED = "Сессия завершена из-за неактивности"


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), 120_000
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_token(user, session_id: str) -> str:
    payload = {
        "sub": user.id,
        "sid": session_id,
        "login": user.login,
        "role": user.role,
        "name": user.name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def mark_seen(user) -> None:
    user.last_seen_at = f"{datetime.now(timezone.utc).timestamp():.3f}"


def idle_expired(user) -> bool:
    raw = getattr(user, "last_seen_at", None)
    if not raw:
        return True
    try:
        seen = float(raw)
    except (TypeError, ValueError):
        return True
    return datetime.now(timezone.utc).timestamp() - seen >= IDLE_TIMEOUT.total_seconds()
