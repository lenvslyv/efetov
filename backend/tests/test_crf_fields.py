"""Field separation must preserve legacy input and both Excel columns."""
import io
import json
import sys
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.crf import apply_section_values, empty_blocks, find_stored, CRF_SCHEMA
from app.brazhnikov import build_final_workbook, NS
from app.models import Patient


class SeparateDemographics(unittest.TestCase):
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
