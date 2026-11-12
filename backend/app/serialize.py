import json

from .models import Patient, StoredFile, User
from .rbac import LOCK_FREE, format_lock


def patient_to_dict(patient: Patient, users: dict[str, User], *, include_blocks: bool = True) -> dict:
    creator = users.get(patient.created_by)
    editor = users.get(patient.updated_by) if patient.updated_by else None
    lock = format_lock(patient.lock_user_id) if patient.lock_user_id else LOCK_FREE
    return {
        "id": patient.id,
        "code": patient.code,
        "center": patient.center,
        "group": patient.group,
        "centerCode": patient.center_code,
        "operationDate": patient.operation_date,
        "createdBy": patient.created_by,
        "createdByLogin": creator.login if creator else patient.created_by,
        "createdByName": creator.name if creator else patient.created_by,
        "createdAt": patient.created_at,
        "updatedAt": patient.updated_at,
        "updatedBy": patient.updated_by or "",
        "updatedByName": editor.name if editor else "",
        "lock": lock,
        **({"blocks": json.loads(patient.blocks_json)} if include_blocks else {}),
    }


def patient_to_json(patient: Patient, users: dict[str, User]) -> str:
    # blocks_json is already valid JSON produced by the clinical write paths.
    # Splice that value into the encoded metadata rather than parsing and
    # re-encoding hundreds of fields for every reader of the journal.
    metadata = json.dumps(patient_to_dict(patient, users, include_blocks=False), ensure_ascii=False, separators=(",", ":"))
    return metadata[:-1] + ',"blocks":' + patient.blocks_json + '}'


def file_to_dict(file: StoredFile) -> dict:
    return {
        "name": file.name,
        "folder": file.folder,
        "author": file.author,
        "date": file.date,
        "comment": file.comment,
    }


def user_to_session(user: User) -> dict:
    return {
        "id": user.id,
        "login": user.login,
        "role": user.role,
        "name": user.name,
    }
