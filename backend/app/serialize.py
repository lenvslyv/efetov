import json
import re

from .models import Patient, StoredFile, User
from .rbac import LOCK_FREE, format_lock
from .storage import upload_path


def user_label(reference: str, users: dict[str, User]) -> str:
    user = users.get(reference)
    if user:
        return user.login
    if re.fullmatch(r"U-(?:[A-Z]+-)?\d+", reference or ""):
        return "Неизвестный пользователь"
    return reference or "Неизвестный пользователь"


def user_references_to_logins(details: str, users: dict[str, User]) -> str:
    references = sorted(users, key=len, reverse=True)
    pattern = "|".join([*(re.escape(value) for value in references), r"U-(?:[A-Z]+-)?\d+"])
    return re.sub(r"(?<![\w-])(?:" + pattern + r")(?![\w-])", lambda match: user_label(match[0], users), details)


def patient_to_dict(patient: Patient, users: dict[str, User], *, include_blocks: bool = True) -> dict:
    creator = users.get(patient.created_by)
    editor = users.get(patient.updated_by) if patient.updated_by else None
    lock = format_lock(patient.lock_user_id) if patient.lock_user_id else LOCK_FREE
    lock_owner = users.get(patient.lock_user_id) if patient.lock_user_id else None
    return {
        "id": patient.id,
        "code": patient.code,
        "center": patient.center,
        "group": patient.group,
        "centerCode": patient.center_code,
        "operationDate": patient.operation_date,
        "createdBy": patient.created_by,
        "createdByLogin": creator.login if creator else "Неизвестный пользователь",
        "createdByName": creator.name if creator else "Неизвестный пользователь",
        "createdAt": patient.created_at,
        "updatedAt": patient.updated_at,
        "updatedBy": patient.updated_by or "",
        "updatedByName": editor.name if editor else "",
        "lock": lock,
        "lockLabel": format_lock(lock_owner.login if lock_owner else "Неизвестный пользователь") if patient.lock_user_id else LOCK_FREE,
        **({"blocks": json.loads(patient.blocks_json)} if include_blocks else {}),
    }


def patient_to_json(patient: Patient, users: dict[str, User]) -> str:
    # blocks_json is already valid JSON produced by the clinical write paths.
    # Splice that value into the encoded metadata rather than parsing and
    # re-encoding hundreds of fields for every reader of the journal.
    metadata = json.dumps(patient_to_dict(patient, users, include_blocks=False), ensure_ascii=False, separators=(",", ":"))
    return metadata[:-1] + ',"blocks":' + patient.blocks_json + '}'


def file_to_dict(file: StoredFile, users: dict[str, User] | None = None) -> dict:
    return {
        "name": file.name,
        "folder": file.folder,
        "author": user_label(file.author, users or {}),
        "date": file.date,
        "comment": file.comment,
        "available": upload_path(file.id).is_file(),
    }


def user_to_session(user: User) -> dict:
    return {
        "id": user.id,
        "login": user.login,
        "role": user.role,
        "name": user.name,
    }
