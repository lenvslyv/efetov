import json
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .brazhnikov import build_final_workbook
from .crf import apply_section_values, empty_blocks, operation_date_from
from .database import Base, SessionLocal, configure_database, engine, get_db
from .deps import Actor, deny, get_current_user, get_session_user, require_permission
from .models import AuditEvent, AuthSession, Patient, StoredFile, StoredFolder, User
from .rbac import (
    ASSIGNABLE_ROLES,
    ROLE_LABELS,
    SECTIONS,
    can_edit_section,
    can,
    center_code,
    next_code,
    next_patient_id,
    now,
    section_label,
    today,
)
from .security import create_token, hash_password, mark_seen, verify_password
from .seed import add_test_pair_accounts, load_seed, reset_database, seed_database
from .serialize import file_to_dict, patient_to_dict, patient_to_json, user_to_session
from .storage import (
    clean_file_name,
    clean_folder_name,
    join_folder,
    known_folders,
    remove_upload,
    require_folder,
    upload_path,
    write_upload,
    delete_folder_tree,
)


class LoginBody(BaseModel):
    login: str
    password: str
    details: str = "Успешная аутентификация"


class CreatePatientBody(BaseModel):
    code: str = ""
    center: str
    operationDate: str = ""
    values: dict[str, str] = Field(default_factory=dict)


class SaveBlockBody(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


class SaveSectionsBody(BaseModel):
    sections: dict[str, dict[str, str]] = Field(default_factory=dict)


class ExportBody(BaseModel):
    details: str


class SliceExportBody(BaseModel):
    ids: list[str] = []


class EndSessionBody(BaseModel):
    reason: str = "manual"


class UpdateRolesBody(BaseModel):
    roles: list[str] = Field(default_factory=list)


class CreateUserBody(BaseModel):
    name: str = ""
    login: str = ""
    email: str = ""
    password: str = ""
    passwordRepeat: str = ""


class UpdateUserBody(BaseModel):
    name: str = ""
    login: str = ""
    email: str = ""


class ChangePasswordBody(BaseModel):
    password: str = ""
    passwordRepeat: str = ""


def users_map(db: Session) -> dict[str, User]:
    return {user.id: user for user in db.query(User).all()}


def runtime_payload(db: Session, actor: Actor, *, include_audit: bool = True, include_files: bool = True, encoded_patients: bool = False) -> dict:
    people = users_map(db)
    patients = [
        (patient_to_json if encoded_patients else patient_to_dict)(item, people)
        for item in db.query(Patient).order_by(Patient.id.asc()).all()
    ]
    files = [file_to_dict(item) for item in db.query(StoredFile).all()] if include_files else []
    folders = sorted(known_folders(db)) if include_files else []
    audit = audit_payload(db) if include_audit and can(actor.role, "audit.view") else []
    return {"patients": patients, "files": files, "folders": folders, "audit": audit}


def audit_payload(db: Session) -> list[dict]:
    return [
        {
            "time": item.time,
            "userId": item.user_id,
            "role": item.role,
            "action": item.action,
            "details": item.details,
        }
        for item in db.query(AuditEvent).order_by(AuditEvent.id.desc()).all()
    ]


def json_response(payload) -> Response:
    # These serializers already return JSON primitives. Avoid FastAPI walking
    # every clinical field again on the event-loop thread before encoding.
    return Response(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), media_type="application/json")


def require_patient_editor(db: Session, actor: Actor, patient: Patient) -> None:
    if actor.role == "stationary" and patient.created_by != actor.id:
        deny(db, actor, "crf.edit", "Врач стационара может редактировать только созданные им карточки")


def add_audit(db: Session, actor: Actor, action: str, details: str):
    db.add(
        AuditEvent(
            time=now(),
            user_id=actor.id,
            role=ROLE_LABELS.get(actor.role, "Роль не назначена"),
            action=action,
            details=details,
        )
    )


def get_patient(db: Session, patient_id: str) -> Patient:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Пациент не найден")
    return patient


def ensure_patient_editor_column() -> None:
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(patients)")).fetchall()
        names = {row[1] for row in rows}
        if names and "updated_by" not in names:
            conn.execute(text("ALTER TABLE patients ADD COLUMN updated_by VARCHAR"))


def ensure_user_seen_column() -> None:
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(users)")).fetchall()
        names = {row[1] for row in rows}
        if names and "last_seen_at" not in names:
            conn.execute(text("ALTER TABLE users ADD COLUMN last_seen_at VARCHAR"))
            conn.execute(
                text("UPDATE users SET last_seen_at = :seen"),
                {"seen": f"{time.time():.3f}"},
            )


def ensure_user_roles_column() -> None:
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(users)")).fetchall()
        names = {row[1] for row in rows}
        if not names:
            return
        if "assigned_roles" not in names:
            conn.execute(text("ALTER TABLE users ADD COLUMN assigned_roles TEXT"))
        conn.execute(
            text(
                "UPDATE users SET assigned_roles = '[\"' || role || '\"]' "
                "WHERE assigned_roles IS NULL OR assigned_roles = ''"
            )
        )


def ensure_user_email_column() -> None:
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(users)")).fetchall()
        names = {row[1] for row in rows}
        if names and "email" not in names:
            conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR"))


def ensure_user_status_column() -> None:
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(users)")).fetchall()
        names = {row[1] for row in rows}
        if not names:
            return
        if "blocked" not in names:
            conn.execute(text("ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0"))
        if "removed_at" not in names:
            conn.execute(text("ALTER TABLE users ADD COLUMN removed_at VARCHAR"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_database()
    Base.metadata.create_all(bind=engine)
    ensure_patient_editor_column()
    ensure_user_seen_column()
    ensure_user_roles_column()
    ensure_user_email_column()
    ensure_user_status_column()
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            seed_database(db)
        else:
            add_test_pair_accounts(db)
            db.commit()
    finally:
        db.close()
    yield


DIST_DIR = Path(__file__).resolve().parents[2] / "dist"
DEFAULT_CORS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


def cors_origins() -> list[str]:
    raw = os.environ.get("EFETOV_CORS_ORIGINS", "").strip()
    if not raw:
        return DEFAULT_CORS
    return [item.strip() for item in raw.split(",") if item.strip()]


app = FastAPI(title="Efetov API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_responses(request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logging.getLogger("uvicorn.error").exception("Request failed: %s %s", request.method, request.url.path)
        raise
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - started) * 1000:.1f}"
    return response


@app.get("/api/health")
def health():
    return {"ok": True, "db": "sqlite"}


@app.get("/api/demo-users")
def demo_users():
    return [
        {
            "id": item["id"],
            "login": item["login"],
            "role": item["role"],
            "name": item["name"],
        }
        for item in load_seed()["users"]
    ]


@app.post("/api/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.login == body.login).first()
    if user and user.removed_at:
        user = None
    if user and user.blocked:
        raise HTTPException(status_code=401, detail="Учётная запись заблокирована")
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    session = AuthSession(id=uuid.uuid4().hex, user_id=user.id, last_seen_at=str(time.time()))
    db.add(session)
    actor = Actor(user)
    add_audit(db, actor, "Вход в систему", body.details)
    db.commit()
    return {"user": user_to_session(user), "token": create_token(user, session.id)}


@app.get("/api/runtime")
def get_runtime(include_audit: bool = True, include_files: bool = True, actor: Actor = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = runtime_payload(db, actor, include_audit=include_audit, include_files=include_files, encoded_patients=True)
    patients = payload.pop("patients")
    other = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return Response('{"patients":[' + ','.join(patients) + '],' + other[1:], media_type="application/json")


@app.get("/api/audit")
def get_audit(actor: Actor = Depends(get_current_user), db: Session = Depends(get_db)):
    require_permission(db, actor, "audit.view")
    return json_response(audit_payload(db))


@app.get("/api/file-index")
def get_file_index(actor: Actor = Depends(get_current_user), db: Session = Depends(get_db)):
    require_permission(db, actor, "files.download")
    return {"files": [file_to_dict(item) for item in db.query(StoredFile).all()], "folders": sorted(known_folders(db))}


@app.post("/api/reset-demo")
def reset_demo(actor: Actor = Depends(get_current_user), db: Session = Depends(get_db)):
    require_permission(db, actor, "users.manage")
    reset_database(db)
    return json_response(runtime_payload(db, actor))


@app.get("/api/export/final.xlsx")
def export_final_workbook(
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "export.run")
    patients = db.query(Patient).order_by(Patient.id.asc()).all()
    db.expunge_all()
    db.rollback()
    try:
        payload = build_final_workbook(patients)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Шаблон выгрузки не найден")
    return _workbook_response(payload, "final_export.xlsx")


@app.post("/api/export/slice.xlsx")
def export_slice_workbook(
    body: SliceExportBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "export.run")
    wanted = list(dict.fromkeys(body.ids))
    if wanted:
        patients = (
            db.query(Patient)
            .filter(Patient.id.in_(wanted))
            .order_by(Patient.id.asc())
            .all()
        )
    else:
        patients = []
    db.expunge_all()
    db.rollback()
    try:
        payload = build_final_workbook(patients)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Шаблон выгрузки не найден")
    return _workbook_response(payload, "stat_slice.xlsx")


def _workbook_response(payload: bytes, filename: str) -> Response:
    return Response(
        payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/export")
def record_export(
    body: ExportBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "export.run")
    add_audit(db, actor, "Экспорт", body.details)
    db.commit()
    return {"ok": True}


@app.post("/api/session/touch")
def touch_session(actor: Actor = Depends(get_current_user), db: Session = Depends(get_db)):
    mark_seen(actor.session)
    db.commit()
    return {"ok": True}


@app.post("/api/session/end")
def end_session(
    body: EndSessionBody,
    actor: Actor = Depends(get_session_user),
    db: Session = Depends(get_db),
):
    actor.session.revoked = 1
    action = "Выход по неактивности" if body.reason == "idle" else "Выход из системы"
    details = (
        "Автоматическое завершение сессии после 15 минут бездействия"
        if body.reason == "idle"
        else "Пользователь завершил сессию"
    )
    add_audit(db, actor, action, details)
    db.commit()
    return {"ok": True}


def assigned_role_list(user: User) -> list[str]:
    raw = user.assigned_roles
    if raw:
        try:
            loaded = json.loads(raw)
        except json.JSONDecodeError:
            loaded = []
        if isinstance(loaded, list):
            return [role for role in ASSIGNABLE_ROLES if role in loaded]
    if user.role in ASSIGNABLE_ROLES:
        return [user.role]
    return []


def account_dict(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "login": user.login,
        "email": user.email or "",
        "role": user.role,
        "roles": assigned_role_list(user),
        "blocked": bool(user.blocked),
    }


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def clean_profile(name: str, login: str, email: str) -> tuple[str, str, str]:
    name = name.strip()
    login = login.strip()
    email = email.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Введите ФИО")
    if not login:
        raise HTTPException(status_code=400, detail="Введите логин")
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=400, detail="Введите почту")
    return name, login, email


def ensure_unique_login(db: Session, login: str, user_id: str | None = None) -> None:
    for other in db.query(User).all():
        if other.id != user_id and other.login.casefold() == login.casefold():
            raise HTTPException(status_code=409, detail="Пользователь с таким логином уже есть")


def check_new_password(password: str, repeat: str) -> None:
    errors = []
    if len(password) < 8:
        errors.append("не менее 8 символов")
    if sum(char.isalpha() for char in password) < 2:
        errors.append("не менее 2 букв")
    if sum(char in "0123456789" for char in password) < 2:
        errors.append("не менее 2 цифр")
    if errors:
        raise HTTPException(status_code=400, detail="Пароль должен содержать: " + "; ".join(errors))
    if password != repeat:
        raise HTTPException(status_code=400, detail="Пароли не совпадают")


def next_user_id(db: Session) -> str:
    numbers = []
    for user in db.query(User).all():
        match = re.search(r"(\d+)$", user.id)
        if match:
            numbers.append(int(match.group(1)))
    number = max(numbers, default=0) + 1
    while db.get(User, f"U-{number:03d}"):
        number += 1
    return f"U-{number:03d}"


@app.get("/api/users")
def list_users(actor: Actor = Depends(get_current_user), db: Session = Depends(get_db)):
    require_permission(db, actor, "users.manage")
    users = (
        db.query(User)
        .filter(User.removed_at.is_(None))
        .order_by(User.id.asc())
        .all()
    )
    return [account_dict(user) for user in users]


@app.put("/api/users/{user_id}/roles")
def update_user_roles(
    user_id: str,
    body: UpdateRolesBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "users.manage")
    user = visible_user(db, user_id)
    unknown = [role for role in body.roles if role not in ASSIGNABLE_ROLES]
    if unknown:
        raise HTTPException(status_code=400, detail="Неизвестная роль")
    selected = [role for role in ASSIGNABLE_ROLES if role in body.roles]
    if not selected:
        raise HTTPException(status_code=400, detail="Назначьте хотя бы одну роль")
    if len(selected) == 1:
        effective = selected[0]
    elif user.role in selected:
        effective = user.role
    else:
        raise HTTPException(
            status_code=400,
            detail=(
                "Сочетание нескольких ролей ещё не согласовано. "
                "Оставьте прежнюю роль отмеченной или выберите только одну."
            ),
        )
    user.assigned_roles = json.dumps(selected, ensure_ascii=False)
    user.role = effective
    labels = ", ".join(ROLE_LABELS[role] for role in selected)
    add_audit(db, actor, "Изменение прав", f"{user.login}: {labels}")
    db.commit()
    return account_dict(user)


@app.post("/api/users")
def create_user(
    body: CreateUserBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "users.manage")
    name, login, email = clean_profile(body.name, body.login, body.email)
    ensure_unique_login(db, login)
    check_new_password(body.password, body.passwordRepeat)
    user = User(
        id=next_user_id(db),
        login=login,
        password_hash=hash_password(body.password),
        role="",
        name=name,
        email=email,
        assigned_roles="[]",
        blocked=0,
    )
    db.add(user)
    add_audit(db, actor, "Создание учётной записи", f"Создана учётная запись {login}")
    db.commit()
    return account_dict(user)


@app.put("/api/users/{user_id}")
def update_user(
    user_id: str,
    body: UpdateUserBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "users.manage")
    user = visible_user(db, user_id)
    name, login, email = clean_profile(body.name, body.login, body.email)
    ensure_unique_login(db, login, user.id)
    user.name = name
    user.login = login
    user.email = email
    add_audit(db, actor, "Изменение учётной записи", f"{login}: обновлены ФИО, логин и почта")
    db.commit()
    return account_dict(user)


@app.put("/api/users/{user_id}/password")
def change_user_password(
    user_id: str,
    body: ChangePasswordBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "users.manage")
    user = visible_user(db, user_id)
    check_new_password(body.password, body.passwordRepeat)
    user.password_hash = hash_password(body.password)
    add_audit(db, actor, "Смена пароля", f"Сменён пароль учётной записи {user.login}")
    db.commit()
    return account_dict(user)


def visible_user(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if not user or user.removed_at:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


@app.post("/api/users/{user_id}/block")
def block_user(
    user_id: str,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "users.manage")
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать свою учётную запись")
    user = visible_user(db, user_id)
    user.blocked = 1
    add_audit(db, actor, "Блокировка учётной записи", f"Заблокирована учётная запись {user.login}")
    db.commit()
    return account_dict(user)


@app.post("/api/users/{user_id}/unblock")
def unblock_user(
    user_id: str,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "users.manage")
    user = visible_user(db, user_id)
    user.blocked = 0
    add_audit(db, actor, "Разблокировка учётной записи", f"Разблокирована учётная запись {user.login}")
    db.commit()
    return account_dict(user)


@app.delete("/api/users/{user_id}")
def remove_user(
    user_id: str,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "users.manage")
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить свою учётную запись")
    user = visible_user(db, user_id)
    user.removed_at = now()
    user.blocked = 1
    add_audit(db, actor, "Удаление учётной записи", f"Учётная запись {user.login} скрыта из списка")
    db.commit()
    return {"ok": True}


@app.post("/api/patients")
def create_patient(
    body: CreatePatientBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "patient.create")
    # Serialize ID/code allocation with the insert, including across workers.
    # SQLite's legacy transaction mode does not BEGIN for the auth SELECTs.
    db.execute(text("BEGIN IMMEDIATE"))
    existing = db.query(Patient.id, Patient.code).all()
    ids = [item.id for item in existing]
    codes = {item.code for item in existing}
    patient_id = next_patient_id(ids)
    prefix = center_code(body.center)
    code = body.code.strip() or next_code(patient_id, prefix)
    if body.code.strip() and code in codes:
        db.rollback()
        raise HTTPException(status_code=409, detail="Карточка с таким шифром уже существует. Укажите другой шифр.")
    while not body.code.strip() and code in codes:
        patient_id = str(int(patient_id) + 1)
        code = next_code(patient_id, prefix)
    operation_date = body.operationDate.strip() or "—"
    blocks = empty_blocks()
    for section_id, _title in SECTIONS:
        incoming = body.values if section_id <= 10 else {}
        apply_section_values(blocks, section_id, incoming)
    created_at = now()
    patient = Patient(
        id=patient_id,
        code=code,
        center=body.center,
        group=body.center,
        center_code=prefix,
        operation_date=operation_date,
        created_by=actor.id,
        created_at=created_at,
        updated_at=created_at,
        lock_user_id=None,
        blocks_json=json.dumps(blocks, ensure_ascii=False),
    )
    db.add(patient)
    add_audit(db, actor, "Создание карты пациента", f"Создана карточка ID {patient_id}, шифр {code}")
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Не удалось создать карточку с этим ID или шифром. Обновите страницу и повторите сохранение.") from exc
    db.refresh(patient)
    return patient_to_dict(patient, users_map(db))


@app.delete("/api/patients/{patient_id}")
def delete_patient(
    patient_id: str,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "patient.delete")
    patient = get_patient(db, patient_id)
    payload = patient_to_dict(patient, users_map(db))
    db.delete(patient)
    add_audit(
        db,
        actor,
        "Удаление карты пациента",
        f"Удалена карточка ID {payload['id']}, шифр {payload['code']}",
    )
    db.commit()
    return payload


@app.put("/api/patients/{patient_id}/sections")
def save_sections(
    patient_id: str,
    body: SaveSectionsBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parsed: list[tuple[int, dict[str, str]]] = []
    for key, values in body.sections.items():
        try:
            section = int(key)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Некорректный номер раздела") from exc
        parsed.append((section, values))
    if not parsed:
        raise HTTPException(status_code=400, detail="Нет данных для сохранения")
    for section, _values in parsed:
        if not can_edit_section(actor.role, section):
            deny(
                db,
                actor,
                "crf.edit",
                f"Редактирование раздела «{section_label(section)}» недоступно для текущей роли",
            )
    patient = get_patient(db, patient_id)
    require_patient_editor(db, actor, patient)
    if patient.lock_user_id and patient.lock_user_id != actor.id:
        deny(
            db,
            actor,
            "crf.edit",
            f"Карточка {patient.code} редактируется пользователем {patient.lock_user_id}",
        )
    blocks = json.loads(patient.blocks_json)
    labels: list[str] = []
    for section, values in sorted(parsed):
        apply_section_values(blocks, section, values)
        labels.append(section_label(section))
    operation_date = operation_date_from(blocks)
    if operation_date:
        patient.operation_date = operation_date
    patient.blocks_json = json.dumps(blocks, ensure_ascii=False)
    patient.updated_at = now()
    patient.updated_by = actor.id
    add_audit(
        db,
        actor,
        "Редактирование разделов",
        f"Пациент {patient.code}: обновлены разделы {', '.join(labels)}",
    )
    db.commit()
    db.refresh(patient)
    return patient_to_dict(patient, users_map(db))


@app.put("/api/patients/{patient_id}/section")
def save_section(
    patient_id: str,
    section: int,
    body: SaveBlockBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    label = section_label(section)
    if not can_edit_section(actor.role, section):
        deny(db, actor, "crf.edit", f"Редактирование раздела «{label}» недоступно для текущей роли")
    patient = get_patient(db, patient_id)
    require_patient_editor(db, actor, patient)
    if patient.lock_user_id and patient.lock_user_id != actor.id:
        deny(
            db,
            actor,
            "crf.edit",
            f"Карточка {patient.code} редактируется пользователем {patient.lock_user_id}",
        )
    blocks = json.loads(patient.blocks_json)
    apply_section_values(blocks, section, body.values)
    operation_date = operation_date_from(blocks)
    if operation_date:
        patient.operation_date = operation_date
    patient.blocks_json = json.dumps(blocks, ensure_ascii=False)
    patient.updated_at = now()
    patient.updated_by = actor.id
    add_audit(db, actor, "Редактирование раздела", f"Пациент {patient.code}: обновлен раздел «{label}»")
    db.commit()
    db.refresh(patient)
    return patient_to_dict(patient, users_map(db))


@app.post("/api/patients/{patient_id}/lock")
def lock_patient(
    patient_id: str,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if actor.role not in {"stationary", "ambulatory", "leader"}:
        deny(db, actor, "crf.edit")
    patient = get_patient(db, patient_id)
    require_patient_editor(db, actor, patient)
    owner = patient.lock_user_id
    if owner and owner != actor.id and actor.role != "leader":
        deny(
            db,
            actor,
            "crf.edit",
            f"Карточка {patient.code} уже редактируется пользователем {owner}",
        )
    if owner == actor.id:
        return patient_to_dict(patient, users_map(db))
    query = db.query(Patient).filter(Patient.id == patient_id)
    if actor.role != "leader":
        query = query.filter(or_(Patient.lock_user_id.is_(None), Patient.lock_user_id == actor.id))
    if query.update({Patient.lock_user_id: actor.id}, synchronize_session=False) != 1:
        db.rollback()
        deny(db, actor, "crf.edit", "Карточка уже взята в работу другим пользователем")
    details = (
        f"Карточка {patient.code}: блокировка перехвачена у {owner}"
        if owner and owner != actor.id
        else f"Карточка {patient.code} взята в работу"
    )
    add_audit(db, actor, "Блокировка карты", details)
    db.commit()
    db.refresh(patient)
    return patient_to_dict(patient, users_map(db))


@app.post("/api/patients/{patient_id}/unlock")
def unlock_patient(
    patient_id: str,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    patient = get_patient(db, patient_id)
    owner = patient.lock_user_id
    if not owner:
        return patient_to_dict(patient, users_map(db))
    if owner != actor.id and actor.role != "leader":
        deny(
            db,
            actor,
            "crf.edit",
            f"Снять блокировку карточки {patient.code} может только {owner} или руководитель",
        )
    query = db.query(Patient).filter(Patient.id == patient_id)
    if actor.role != "leader":
        query = query.filter(Patient.lock_user_id == actor.id)
    if query.update({Patient.lock_user_id: None}, synchronize_session=False) != 1:
        db.rollback()
        deny(db, actor, "crf.edit", "Блокировка изменилась. Обновите карточку")
    add_audit(db, actor, "Снятие блокировки", f"Карточка {patient.code}: блокировка снята")
    db.commit()
    db.refresh(patient)
    return patient_to_dict(patient, users_map(db))


class CreateFolderBody(BaseModel):
    parent: str = ""
    name: str


@app.post("/api/folders")
def create_folder(
    body: CreateFolderBody,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "files.manage")
    parent = require_folder(db, body.parent)
    name = clean_folder_name(body.name)
    path = join_folder(parent, name)
    if path in known_folders(db):
        raise HTTPException(status_code=409, detail="Папка уже есть")
    db.add(StoredFolder(path=path))
    add_audit(db, actor, "Создание папки", f"Создана папка «{path}»")
    db.commit()
    return {"path": path}


@app.delete("/api/folders")
def delete_folder(
    path: str,
    confirmed: bool = False,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "files.manage")
    if not confirmed:
        raise HTTPException(status_code=400, detail="Подтвердите удаление папки со всем содержимым")
    folder = require_folder(db, path)
    if not folder:
        raise HTTPException(status_code=400, detail="Корень хранилища удалять нельзя")
    add_audit(db, actor, "Удаление папки", f"Удалена папка «{folder}» со всем содержимым")
    files, folders = delete_folder_tree(db, folder)
    return {"ok": True, "files": files, "folders": folders}


@app.post("/api/files")
async def upload_file(
    file: UploadFile = File(...),
    folder: str = Form(""),
    comment: str = Form(""),
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "files.manage")
    target = require_folder(db, folder)
    name = clean_file_name(file.filename)
    if db.query(StoredFile).filter(StoredFile.name == name).first():
        raise HTTPException(status_code=409, detail="Файл с таким именем уже есть")
    content = await file.read()
    stored = StoredFile(
        name=name,
        folder=target,
        author=actor.id,
        date=today(),
        comment=comment.strip(),
    )
    db.add(stored)
    db.flush()
    write_upload(stored.id, content)
    add_audit(db, actor, "Загрузка файла", f"Загружен файл «{name}» в «{target or 'корень'}»")
    db.commit()
    db.refresh(stored)
    return file_to_dict(stored)


@app.get("/api/files/content")
def download_file(
    name: str,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "files.download")
    stored = db.query(StoredFile).filter(StoredFile.name == name).first()
    if not stored:
        raise HTTPException(status_code=404, detail="Файл не найден")
    path = upload_path(stored.id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Содержимое файла не сохранено")
    return FileResponse(path, filename=stored.name, content_disposition_type="attachment")


@app.delete("/api/files")
def delete_file(
    name: str,
    actor: Actor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_permission(db, actor, "files.manage")
    stored = db.query(StoredFile).filter(StoredFile.name == name).first()
    if not stored:
        raise HTTPException(status_code=404, detail="Файл не найден")
    remove_upload(stored.id)
    db.delete(stored)
    add_audit(db, actor, "Удаление файла", f"Удален файл «{name}»")
    db.commit()
    return {"ok": True}


def _spa_file(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    target = DIST_DIR / full_path
    if full_path and target.is_file():
        return FileResponse(target)
    index = DIST_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(
        status_code=404,
        detail="UI не собран. На сервере выполните npm run build",
    )


@app.get("/")
def spa_root():
    return _spa_file("")


@app.get("/{full_path:path}")
def spa(full_path: str):
    return _spa_file(full_path)
