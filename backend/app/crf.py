import json
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parents[2] / "src" / "entities" / "crf" / "catalog.json"
_CATALOG = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
CRF_SCHEMA = _CATALOG["fields"]
FIELD_SECTION = {field["key"]: field["section"] for field in CRF_SCHEMA}


def _norm(value: str) -> str:
    return " ".join(str(value or "").replace("\n", " ").split()).strip().lower()


_LABEL_OWNER = {}
for _field in CRF_SCHEMA:
    _name = _norm(_field["label"])
    if _name and _name not in _LABEL_OWNER:
        _LABEL_OWNER[_name] = _field["key"]


def fields_of_section(section_id: int) -> list[dict]:
    return [field for field in CRF_SCHEMA if field.get("section") == section_id]


def field_names(field: dict) -> list[str]:
    return [field["label"], *field.get("aliases", [])]


def _claims(field: dict, item: dict) -> bool:
    if item.get("key") == field["key"]:
        return True
    if item.get("key") and item.get("key") != field["key"]:
        return False
    name = _norm(item.get("name", ""))
    aliases = {_norm(alias) for alias in field.get("aliases", [])}
    if name in aliases:
        return True
    return _LABEL_OWNER.get(_norm(field["label"])) == field["key"] and name == _norm(field["label"])


def match_stored(stored: list[dict], field: dict) -> dict | None:
    for item in stored:
        if _claims(field, item):
            return item
    return None


def _iter_stored(blocks: dict) -> list[dict]:
    stored: list[dict] = []
    for fields in blocks.values():
        if isinstance(fields, list):
            stored.extend(item for item in fields if isinstance(item, dict))
    return stored


def find_stored(blocks: dict, field: dict) -> dict | None:
    return match_stored(_iter_stored(blocks), field)


def _incoming_value(field: dict, values: dict[str, str]) -> str | None:
    key = field["key"]
    if key in values:
        return values[key]
    label = field["label"]
    if label in values and _LABEL_OWNER.get(_norm(label)) == key:
        return values[label]
    for alias in field.get("aliases", []):
        if alias in values:
            return values[alias]
    return None


def operation_date_from(blocks: dict) -> str:
    field = next(item for item in CRF_SCHEMA if item["key"] == "opDate")
    stored = find_stored(blocks, field)
    return str((stored or {}).get("value") or "")


def apply_section_values(blocks: dict, section_id: int, values: dict[str, str]) -> dict:
    from .rbac import section_label

    bucket = section_label(section_id)
    blocks.setdefault(bucket, [])
    for field in fields_of_section(section_id):
        target = find_stored(blocks, field)
        value = _incoming_value(field, values)
        if value is None:
            value = (target or {}).get("value", "")
        if target is None:
            blocks[bucket].append(
                {
                    "key": field["key"],
                    "name": field["label"],
                    "value": value,
                    "hint": field.get("hint"),
                }
            )
        else:
            target["key"] = field["key"]
            target["value"] = value
    return blocks


def empty_blocks() -> dict[str, list[dict]]:
    from .rbac import SECTIONS, section_label

    blocks: dict[str, list[dict]] = {}
    for section_id, _title in SECTIONS:
        blocks[section_label(section_id)] = [
            {
                "key": field["key"],
                "name": field["label"],
                "value": "",
                "hint": field.get("hint"),
            }
            for field in fields_of_section(section_id)
        ]
    return blocks
