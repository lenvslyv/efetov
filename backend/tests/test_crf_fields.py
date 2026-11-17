"""Field separation must preserve legacy input and both Excel columns."""
import io
import json
import sys
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from test_environment import TEST_DATA

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.crf import apply_section_values, empty_blocks, find_stored, CRF_SCHEMA
from app.brazhnikov import build_final_workbook, NS
from app.models import Patient
from app.models import User
from app.serialize import patient_to_dict, file_to_dict, user_label, user_references_to_logins
from app.rbac import LOCK_FREE, format_lock


class LockOwnerLabel(unittest.TestCase):
    def test_audit_and_file_authors_resolve_logins_even_after_rename_or_removal(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session
        from app.database import Base
        from app.models import AuditEvent, StoredFile
        from app.main import audit_payload

        isolated = create_engine("sqlite://")
        try:
            Base.metadata.create_all(isolated)
            with Session(isolated) as db:
                user = User(id="U-STA-003", login="doctor_blohin", name="Doctor", role="stationary", password_hash="unused")
                db.add(user)
                db.add(AuditEvent(time="17.11.2026", user_id=user.id, role="Doctor", action="Lock", details="Owner U-STA-003; previous U-999"))
                stored = StoredFile(name="guide.txt", folder="", author=user.id, date="17.11.2026", comment="")
                db.add(stored)
                db.commit()
                for login in ("doctor_blohin", "renamed_doctor"):
                    user.login = login
                    user.removed_at = "17.11.2026"
                    db.commit()
                    event = audit_payload(db)[0]
                    self.assertEqual(event["userLogin"], login)
                    self.assertIn(login, event["details"])
                    self.assertNotIn("U-", event["details"])
                    self.assertEqual(file_to_dict(stored, {user.id: user})["author"], login)
                    self.assertEqual(stored.author, user.id)
                self.assertEqual(user_label("Historical author", {}), "Historical author")
                self.assertNotIn("U-999", user_label("U-999", {}))
                self.assertEqual(user_references_to_logins("XU-STA-003-extra", {user.id: user}), "XU-STA-003-extra")
        finally:
            isolated.dispose()

    def test_login_is_displayed_while_lock_keeps_its_stable_owner_id(self):
        owner = User(id="U-STA-003", login="doctor_blohin", name="Doctor")
        patient = Patient(id="lock-label", created_by=owner.id, lock_user_id=owner.id, blocks_json="{}")
        serialized = patient_to_dict(patient, {owner.id: owner})
        self.assertEqual(serialized["lock"], format_lock(owner.id))
        self.assertEqual(serialized["lockLabel"], format_lock(owner.login))
        owner.login = "new_login"
        self.assertEqual(patient_to_dict(patient, {owner.id: owner})["lockLabel"], format_lock("new_login"))
        self.assertNotIn(owner.id, patient_to_dict(patient, {})["lockLabel"])
        patient.lock_user_id = None
        self.assertEqual(patient_to_dict(patient, {})["lockLabel"], LOCK_FREE)


class SeparateDemographics(unittest.TestCase):
    def test_manual_bmi_is_not_recalculated_and_can_be_cleared(self):
        bmi = next(f for f in CRF_SCHEMA if f['key'] == 'bmi')
        blocks = apply_section_values(empty_blocks(), 2, {'height': '180', 'weight': '81', 'bmi': '31,27'})
        blocks = apply_section_values(blocks, 2, {'height': '170'})
        blocks = apply_section_values(blocks, 1, {'age': '55'})
        self.assertEqual(find_stored(blocks, bmi)['value'], '31,27')
        blocks = apply_section_values(blocks, 2, {'bmi': ''})
        self.assertEqual(find_stored(blocks, bmi)['value'], '')

    def test_manual_bmi_export_preserves_modern_and_legacy_values(self):
        for legacy in (False, True):
            for manual in ('31,27', ''):
                blocks = {'test': [
                    {'key': 'height', 'name': 'Рост', 'value': '180'},
                    {'key': 'weight', 'name': 'Вес', 'value': '81'},
                    {'key': 'bmi', 'name': 'ИМТ (вычисляемый параметр)', 'value': manual},
                ]}
                if legacy:
                    for field in blocks['test']:
                        field.pop('key')
                patient = Patient(id='manual-bmi', blocks_json=json.dumps(blocks), operation_date='')
                with zipfile.ZipFile(io.BytesIO(build_final_workbook([patient]))) as book:
                    sheet = ET.fromstring(book.read('xl/worksheets/sheet1.xml'))
                value = ''.join(n.text or '' for n in sheet.findall('.//m:c[@r="N3"]//m:t', NS))
                self.assertEqual(value, manual, (legacy, manual))

    def test_former_computed_labels_keep_legacy_matching(self):
        for key in ('p1e', 'p1f', 'p1g', 'bmi'):
            field = next(f for f in CRF_SCHEMA if f['key'] == key)
            self.assertNotIn('вычисляемый параметр', field['label'])
            self.assertNotIn('computedFrom', field)
            blocks = {'legacy': [{'name': field['aliases'][0], 'value': 'ручное значение'}]}
            self.assertEqual(find_stored(blocks, field)['value'], 'ручное значение')

    def test_legacy_combined_value_is_preserved_without_guessing(self):
        address = next(f for f in CRF_SCHEMA if f['key'] == 'p1j')
        social = next(f for f in CRF_SCHEMA if f['key'] == 'p1k')
        for field in [{'name': 'Адрес   Социальный статус', 'value': 'старый ввод'},
                      {'key': 'p1j', 'name': 'Адрес   Социальный статус', 'value': 'старый ввод'}]:
            blocks = {'legacy': [field]}
            self.assertEqual(find_stored(blocks, address)['value'], 'старый ввод')
            self.assertIsNone(find_stored(blocks, social))

    def test_independent_updates_and_excel_columns(self):
        blocks = apply_section_values(empty_blocks(), 1, {'p1j': 'Москва, улица Тестовая, 1', 'p1k': 'Работает'})
        blocks = apply_section_values(blocks, 1, {'p1k': 'Пенсионер'})
        patient = Patient(id='layout-test', blocks_json=json.dumps(blocks), operation_date='')
        with zipfile.ZipFile(io.BytesIO(build_final_workbook([patient]))) as book:
            sheet = ET.fromstring(book.read('xl/worksheets/sheet1.xml'))
        def value(cell):
            return ''.join(n.text or '' for n in sheet.findall(f'.//m:c[@r="{cell}"]//m:t', NS))
        self.assertEqual(value('J3'), 'Москва, улица Тестовая, 1')
        self.assertEqual(value('K3'), 'Пенсионер')


if __name__ == '__main__':
    unittest.main()
