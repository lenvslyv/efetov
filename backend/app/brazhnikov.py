import io
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

from .crf import CRF_SCHEMA, compute_bmi, find_stored
from .models import Patient

TEMPLATE_PATH = Path(__file__).resolve().parents[2] / "Шаблон выгрузки Бражников.xlsx"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
DATA_START = 3
CELL_RE = re.compile(r'<c r="([A-Z]+)2"([^>/]*)(?:/>|>(.*?)</c>)', re.DOTALL)
EMPTY_ROW_RE = re.compile(r'<row r="(\d+)"([^>]*)/>')


def _norm(value: str) -> str:
    text = " ".join(str(value or "").replace("\r", "").replace("\n", " ").split()).strip().lower()
    text = text.replace("–", "-").replace("—", "-").replace("−", "-")
    return text.replace("/ ", "/").replace(" /", "/")


def _shared_strings(blob: bytes) -> list[str]:
    root = ET.fromstring(blob)
    values = []
    for item in root.findall("m:si", NS):
        values.append("".join(node.text or "" for node in item.findall(".//m:t", NS)))
    return values


def _header_columns(sheet_xml: str, shared: list[str]) -> list[tuple[str, str]]:
    row_start = sheet_xml.find('<row r="2"')
    row_end = sheet_xml.find("</row>", row_start)
    row = sheet_xml[row_start:row_end]
    columns = []
    for match in CELL_RE.finditer(row):
        column, attrs, inner = match.group(1), match.group(2), match.group(3) or ""
        header = ""
        if 't="s"' in attrs or 't="s"' in inner:
            value = re.search(r"<v>(\d+)</v>", inner)
            if value:
                header = shared[int(value.group(1))]
        elif 't="inlineStr"' in attrs or "<is>" in inner:
            header = "".join(re.findall(r"<t[^>]*>(.*?)</t>", inner))
        columns.append((column, header))
    return columns


def _queues() -> dict[str, list[dict]]:
    queues: dict[str, list[dict]] = defaultdict(list)
    for field in CRF_SCHEMA:
        seen = set()
        for header in field.get("excelHeaders") or []:
            key = _norm(header)
            if not key or key in seen:
                continue
            seen.add(key)
            queues[key].append(field)
    return queues


def _column_fields(columns: list[tuple[str, str]]) -> list[dict | None]:
    queues = _queues()
    cursor: dict[str, int] = defaultdict(int)
    fields: list[dict | None] = []
    for _column, header in columns:
        key = _norm(header)
        if not key:
            fields.append(None)
            continue
        queue = queues.get(key) or []
        index = cursor[key]
        cursor[key] += 1
        fields.append(queue[index] if index < len(queue) else None)
    return fields


def _xml_text(value: str) -> str:
    escaped = (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    space = ""
    if value[:1].isspace() or value[-1:].isspace() or "\n" in value:
        space = ' xml:space="preserve"'
    return f"<t{space}>{escaped}</t>"


def _cell(column: str, row: int, value: str) -> str:
    return f'<c r="{column}{row}" t="inlineStr"><is>{_xml_text(value)}</is></c>'


def _field_value(patient: Patient, blocks: dict, field: dict) -> str:
    stored = find_stored(blocks, field)
    value = str((stored or {}).get("value") or "")
    if field["key"] == "bmi":
        height = find_stored(blocks, next(item for item in CRF_SCHEMA if item["key"] == "height"))
        weight = find_stored(blocks, next(item for item in CRF_SCHEMA if item["key"] == "weight"))
        computed = compute_bmi(
            str((height or {}).get("value") or ""),
            str((weight or {}).get("value") or ""),
        )
        return computed or value
    if field["key"] == "opDate" and not value:
        journal = str(patient.operation_date or "").strip()
        if journal and journal != "—":
            return journal
    return value


def _patient_cells(patient: Patient, columns: list[tuple[str, str]], fields: list[dict | None], row: int) -> str:
    blocks = json.loads(patient.blocks_json)
    stored = [item for items in blocks.values() if isinstance(items, list) for item in items if isinstance(item, dict)]
    # Modern cards have unique keys. Legacy, unkeyed cards keep the original
    # ordered alias matching so duplicate clinical labels do not change meaning.
    indexed: dict[str, dict] = {}
    for item in stored:
        if item.get("key"):
            indexed.setdefault(item["key"], item)
    legacy = any(not item.get("key") for item in stored)
    def value_of(field: dict) -> str:
        if legacy:
            return _field_value(patient, blocks, field)
        value = str(indexed.get(field["key"], {}).get("value") or "")
        if field["key"] == "bmi":
            return compute_bmi(str(indexed.get("height", {}).get("value") or ""), str(indexed.get("weight", {}).get("value") or "")) or value
        if field["key"] == "opDate" and not value:
            return patient.operation_date if patient.operation_date and patient.operation_date != "-" else ""
        return value
    parts = []
    for (column, _header), field in zip(columns, fields):
        if field is None:
            continue
        value = value_of(field)
        if value == "":
            continue
        parts.append(_cell(column, row, value))
    return "".join(parts)


def build_final_workbook(patients: list[Patient]) -> bytes:
    if not TEMPLATE_PATH.is_file():
        raise FileNotFoundError(TEMPLATE_PATH)
    with zipfile.ZipFile(TEMPLATE_PATH) as book:
        sheet_xml = book.read("xl/worksheets/sheet1.xml").decode("utf-8")
        shared = _shared_strings(book.read("xl/sharedStrings.xml"))
        columns = _header_columns(sheet_xml, shared)
        fields = _column_fields(columns)
        pieces = {
            DATA_START + index: _patient_cells(patient, columns, fields, DATA_START + index)
            for index, patient in enumerate(patients)
        }
        filled = EMPTY_ROW_RE.sub(lambda match: _replace_row(match, pieces), sheet_xml)
        last_row = DATA_START + len(patients) - 1
        template_last = 98
        if last_row > template_last:
            extra = []
            sample = re.search(r'<row r="98"([^>]*)/>', filled)
            attrs = sample.group(1) if sample else ' ht="15.75" customHeight="1"'
            for row in range(template_last + 1, last_row + 1):
                cells = pieces.get(row, "")
                if cells:
                    extra.append(f'<row r="{row}"{attrs}>{cells}</row>')
                else:
                    extra.append(f'<row r="{row}"{attrs}/>')
            filled = filled.replace("</sheetData>", "".join(extra) + "</sheetData>", 1)
            filled = filled.replace(
                '<dimension ref="A1:MZ98"/>',
                f'<dimension ref="A1:MZ{last_row}"/>',
                1,
            )
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as target:
            for info in book.infolist():
                payload = filled.encode("utf-8") if info.filename == "xl/worksheets/sheet1.xml" else book.read(info.filename)
                target.writestr(info.filename, payload, compress_type=info.compress_type)
        return output.getvalue()


def _replace_row(match: re.Match[str], pieces: dict[int, str]) -> str:
    row = int(match.group(1))
    cells = pieces.get(row)
    if not cells:
        return match.group(0)
    return f'<row r="{row}"{match.group(2)}>{cells}</row>'
