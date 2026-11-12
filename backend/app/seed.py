import json
from pathlib import Path

from sqlalchemy.orm import Session

from .models import AuditEvent, AuthSession, Patient, StoredFile, StoredFolder, User
from .rbac import lock_owner_id
from .security import hash_password

SEED_PATH = Path(__file__).resolve().parent.parent / "seed.json"

# Вторая учётная запись каждой клинической роли и две записи системного
# администратора. Администратор входит тем же способом, что и остальные,
# и не получает отдельных прав: модель его доступа ещё не согласована.
TEST_PAIR_ACCOUNTS = (
    ("U-STA-005", "stationary_doctor_2", "Doctor123", "stationary", "Врач стационара 2"),
    ("U-AMB-002", "ambulatory_doctor_2", "Doctor123", "ambulatory", "Врач амбулатории 2"),
    ("U-LEAD-002", "manager_2", "Manager123", "leader", "Руководитель исследования 2"),
    ("U-ADM-001", "administrator_1", "Admin123", "administrator", "Системный администратор 1"),
    ("U-ADM-002", "administrator_2", "Admin123", "administrator", "Системный администратор 2"),
)


def load_seed() -> dict:
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def add_test_pair_accounts(db: Session) -> None:
    known_ids = {row[0] for row in db.query(User.id).all()}
    known_logins = {row[0].casefold() for row in db.query(User.login).all()}
    for user_id, login, password, role, name in TEST_PAIR_ACCOUNTS:
        if user_id in known_ids or login.casefold() in known_logins:
            continue
        db.add(
            User(
                id=user_id,
                login=login,
                password_hash=hash_password(password),
                role=role,
                name=name,
                assigned_roles=json.dumps([role], ensure_ascii=False),
                blocked=0,
            )
        )
        known_ids.add(user_id)
        known_logins.add(login.casefold())


def seed_database(db: Session) -> None:
    payload = load_seed()
    users_by_id: dict[str, dict] = {}
    for item in payload["users"]:
        users_by_id[item["id"]] = item
        db.add(
            User(
                id=item["id"],
                login=item["login"],
                password_hash=hash_password(item["password"]),
                role=item["role"],
                name=item["name"],
                assigned_roles=json.dumps([item["role"]], ensure_ascii=False),
            )
        )

    extra_creators = {
        "U-STA-002": ("krasnov", "stationary", "Краснов", "unused"),
        "U-STA-003": ("doctor_blohin", "stationary", "Врач стационара", "unused"),
        "U-STA-004": ("doctor_ryzhih", "stationary", "Врач стационара", "unused"),
    }
    for user_id, (login, role, name, password) in extra_creators.items():
        if user_id not in users_by_id:
            db.add(
                User(
                    id=user_id,
                    login=login,
                    password_hash=hash_password(password),
                    role=role,
                    name=name,
                    assigned_roles=json.dumps([role], ensure_ascii=False),
                )
            )
    add_test_pair_accounts(db)

    for item in payload["patients"]:
        db.add(
            Patient(
                id=item["id"],
                code=item["code"],
                center=item["center"],
                group=item.get("group") or item["center"],
                center_code=item.get("centerCode") or "",
                operation_date=item.get("operationDate") or "—",
                created_by=item["createdBy"],
                created_at=item["createdAt"],
                updated_at=item["updatedAt"],
                lock_user_id=lock_owner_id(item.get("lock")),
                blocks_json=json.dumps(item["blocks"], ensure_ascii=False),
            )
        )

    for item in payload["files"]:
        db.add(
            StoredFile(
                name=item["name"],
                folder=item["folder"],
                author=item["author"],
                date=item["date"],
                comment=item["comment"],
            )
        )

    for item in reversed(payload["audit"]):
        db.add(
            AuditEvent(
                time=item["time"],
                user_id=item["userId"],
                role=item["role"],
                action=item["action"],
                details=item["details"],
            )
        )
    db.commit()


def reset_database(db: Session) -> None:
    from .storage import remove_upload

    for stored in db.query(StoredFile).all():
        remove_upload(stored.id)
    db.query(AuditEvent).delete()
    db.query(StoredFolder).delete()
    db.query(StoredFile).delete()
    db.query(Patient).delete()
    db.query(AuthSession).delete()
    db.query(User).delete()
    db.commit()
    seed_database(db)
