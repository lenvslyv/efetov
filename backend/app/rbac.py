from datetime import datetime, timedelta, timezone

MOSCOW = timezone(timedelta(hours=3))

ROLE_LABELS = {
    "leader": "Руководитель исследования",
    "stationary": "Врач стационара",
    "ambulatory": "Врач амбулатории",
    "administrator": "Системный администратор",
}

PERMISSIONS = {
    "stationary": ["patient.create", "files.download"],
    "ambulatory": ["files.download"],
    "leader": [
        "patient.create",
        "patient.delete",
        "files.download",
        "files.manage",
        "audit.view",
        "export.run",
        "users.manage",
    ],
    "administrator": [],
}

SECTIONS = [
    (1, "Данные о пациенте"),
    (2, "Антропометрические данные"),
    (3, "Данные об онкологическом заболевании"),
    (4, "Предоперационное инструментальное обследование"),
    (5, "Предоперационное лабораторное обследование"),
    (6, "Данные стационара"),
    (7, "Интраоперационные данные"),
    (8, "Течение послеоперационного периода"),
    (9, "Послеоперационные анализы"),
    (10, "Данные патоморфологического исследования"),
    (11, "Отдаленные результаты"),
    (12, "Ответственные"),
    (13, "Исследование - цифровая детализация"),
    (14, "Исследование - Забрюшинный доступ"),
    (15, "Исследование - цифровая детализация+ ГИ"),
]

MESSAGES = {
    "patient.create": "Создание карточки пациента недоступно для текущей роли",
    "patient.delete": "Удаление пациента недоступно для текущей роли",
    "files.download": "Скачивание файлов недоступно для текущей роли",
    "files.manage": "Управление файлами недоступно для текущей роли",
    "audit.view": "Модуль аудита недоступен для текущей роли",
    "export.run": "Выгрузка недоступна для текущей роли",
    "users.manage": "Модуль администрирования недоступен для текущей роли",
    "crf.edit": "Редактирование раздела недоступно для текущей роли",
}

LOCK_FREE = "нет"
ASSIGNABLE_ROLES = ("stationary", "ambulatory", "leader")


def now() -> str:
    return datetime.now(MOSCOW).strftime("%d.%m.%Y %H:%M")


def today() -> str:
    return datetime.now(MOSCOW).strftime("%d.%m.%Y")


def can(role: str, permission: str) -> bool:
    return permission in PERMISSIONS.get(role, [])


def section_by_id(section_id: int) -> tuple[int, str] | None:
    for item in SECTIONS:
        if item[0] == section_id:
            return item
    return None


def section_label(section_id: int) -> str:
    found = section_by_id(section_id)
    if not found:
        return str(section_id)
    return f"{found[0]}. {found[1]}"


def can_view_section(role: str, section_id: int) -> bool:
    if section_by_id(section_id) is None:
        return False
    return role in {"leader", "stationary", "ambulatory"}


def can_edit_section(role: str, section_id: int) -> bool:
    """Section rights; stationary ownership is also enforced by the API."""
    if section_by_id(section_id) is None:
        return False
    if role == "leader":
        return True
    if role == "stationary":
        return 1 <= section_id <= 10
    if role == "ambulatory":
        return 11 <= section_id <= 15
    return False


def format_lock(user_id: str) -> str:
    return f"редактируется: {user_id}"


def lock_owner_id(lock: str | None) -> str | None:
    value = (lock or "").strip()
    if not value or value == LOCK_FREE:
        return None
    prefix = "редактируется:"
    if value.lower().startswith(prefix):
        return value.split(":", 1)[1].strip()
    return value


def center_code(center: str) -> str:
    if "Блохина" in center:
        return "Б"
    if "Рыжих" in center:
        return "Р"
    return "С"


def next_patient_id(ids: list[str]) -> str:
    numbers = [int(item) for item in ids if str(item).isdigit()]
    return str((max(numbers) if numbers else 0) + 1)


def next_code(patient_id: str, prefix: str = "С") -> str:
    return f"{prefix}-2026-{str(patient_id).zfill(3)}"
