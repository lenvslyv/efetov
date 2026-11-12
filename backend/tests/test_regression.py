"""API regression tests. Always use a temporary database and temporary uploads."""
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

TEST_DATA = tempfile.TemporaryDirectory(prefix="efetov-tests-")
os.environ["EFETOV_DATA_DIR"] = TEST_DATA.name
os.environ["EFETOV_DB_PATH"] = str(Path(TEST_DATA.name) / "test.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, engine
from app.models import AuthSession, Patient, StoredFile, StoredFolder
from app.security import decode_token
from app.storage import delete_folder_tree, upload_path
from app.serialize import patient_to_dict
from app.main import users_map


class ApiRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        engine.dispose()
        TEST_DATA.cleanup()

    def login(self, name="manager", password="Manager123"):
        response = self.client.post("/api/login", json={"login": name, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["token"]

    def headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_password_rejected_at_api_without_creating_account(self):
        headers = self.headers(self.login())
        for password in ("12345678", "Password", "Ab12"):
            response = self.client.post("/api/users", headers=headers, json={
                "name": "Тест", "login": "invalid-test", "email": "test@example.org",
                "password": password, "passwordRepeat": password,
            })
            self.assertEqual(response.status_code, 400, response.text)
        self.assertFalse(any(row["login"] == "invalid-test" for row in self.client.get("/api/users", headers=headers).json()))
        response = self.client.post("/api/users", headers=headers, json={
            "name": "Тест", "login": "password-test", "email": "test@example.org",
            "password": "Doctor12", "passwordRepeat": "Doctor12",
        })
        self.assertEqual(response.status_code, 200, response.text)
        user_id = response.json()["id"]
        changed = self.client.put(f"/api/users/{user_id}/password", headers=headers,
                                 json={"password": "bad", "passwordRepeat": "bad"})
        self.assertEqual(changed.status_code, 400)
        self.login("password-test", "Doctor12")

    def test_cascade_delete_protects_siblings_and_requires_confirmation_and_role(self):
        manager = self.headers(self.login())
        doctor = self.headers(self.login("stationary_doctor", "Doctor123"))
        for parent, name in (("", "Cascade"), ("Cascade", "Child"), ("", "Cascade-other")):
            response = self.client.post("/api/folders", headers=manager, json={"parent": parent, "name": name})
            self.assertEqual(response.status_code, 200, response.text)
        uploaded = self.client.post("/api/files", headers=manager,
            data={"folder": "Cascade / Child", "comment": "test"}, files={"file": ("cascade.txt", b"real content")})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        with SessionLocal() as db:
            file_id = db.query(StoredFile).filter_by(name="cascade.txt").one().id
        self.assertTrue(upload_path(file_id).exists())
        self.assertEqual(self.client.delete("/api/folders", params={"path": "Cascade"}, headers=manager).status_code, 400)
        self.assertEqual(self.client.delete("/api/folders", params={"path": "Cascade", "confirmed": True}, headers=doctor).status_code, 403)
        self.assertEqual(self.client.delete("/api/folders", params={"path": "", "confirmed": True}, headers=manager).status_code, 400)
        response = self.client.delete("/api/folders", params={"path": "Cascade", "confirmed": True}, headers=manager)
        self.assertEqual(response.status_code, 200, response.text)
        snapshot = self.client.get("/api/runtime", headers=manager).json()
        self.assertNotIn("Cascade", snapshot["folders"])
        self.assertNotIn("Cascade / Child", snapshot["folders"])
        self.assertIn("Cascade-other", snapshot["folders"])
        self.assertFalse(upload_path(file_id).exists())
        self.assertTrue(any(event["action"] == "Удаление папки" for event in snapshot["audit"]))

    def test_delete_rollback_restores_bytes(self):
        with SessionLocal() as db:
            db.add(StoredFolder(path="Rollback"))
            file = StoredFile(name="rollback.txt", folder="Rollback", author="test", date="test", comment="")
            db.add(file)
            db.commit()
            path = upload_path(file.id)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"must survive")
            with patch.object(db, "commit", side_effect=RuntimeError("database unavailable")):
                with self.assertRaises(RuntimeError):
                    delete_folder_tree(db, "Rollback")
            self.assertEqual(path.read_bytes(), b"must survive")
            self.assertIsNotNone(db.query(StoredFile).filter_by(name="rollback.txt").first())

    def test_session_expiry_and_logout_are_independent_and_revoke_old_token(self):
        token_a = self.login("stationary_doctor", "Doctor123")
        token_b = self.login("ambulatory_doctor", "Doctor123")
        token_same_user = self.login("stationary_doctor", "Doctor123")
        with SessionLocal() as db:
            session = db.get(AuthSession, decode_token(token_a)["sid"])
            session.last_seen_at = str(time.time() - 901)
            db.commit()
        self.assertEqual(self.client.get("/api/runtime", headers=self.headers(token_a)).status_code, 401)
        for token in (token_b, token_same_user):
            self.assertEqual(self.client.get("/api/runtime", headers=self.headers(token)).status_code, 200)
        self.assertEqual(self.client.post("/api/session/end", headers=self.headers(token_a), json={"reason": "idle"}).status_code, 200)
        self.assertEqual(self.client.post("/api/session/touch", headers=self.headers(token_a)).status_code, 401)
        self.assertEqual(self.client.post("/api/session/touch", headers=self.headers(token_b)).status_code, 200)

    def test_locks_survive_manual_and_idle_exit_and_only_owner_or_manager_releases(self):
        manager = self.headers(self.login())
        doctor_token = self.login("stationary_doctor", "Doctor123")
        doctor = self.headers(doctor_token)
        other = self.headers(self.login("stationary_doctor_2", "Doctor123"))
        created = self.client.post("/api/patients", headers=doctor, json={"center": "test"})
        self.assertEqual(created.status_code, 200, created.text)
        patient_id = created.json()["id"]
        base = f"/api/patients/{patient_id}"
        self.client.post(base + "/unlock", headers=manager)
        self.assertEqual(self.client.post(base + "/lock", headers=doctor).status_code, 200)
        self.assertEqual(self.client.post(base + "/unlock", headers=other).status_code, 403)
        self.assertEqual(self.client.post(base + "/lock", headers=other).status_code, 403)
        self.assertEqual(self.client.put(base + "/sections", headers=other, json={"sections": {"1": {"test": "no"}}}).status_code, 403)
        for reason in ("manual", "idle"):
            self.client.post("/api/session/end", headers=doctor, json={"reason": reason})
            with SessionLocal() as db:
                self.assertIsNotNone(db.get(Patient, patient_id).lock_user_id)
            doctor = self.headers(self.login("stationary_doctor", "Doctor123"))
        self.assertEqual(self.client.post(base + "/unlock", headers=doctor).status_code, 200)
        self.client.post(base + "/lock", headers=doctor)
        self.assertEqual(self.client.post(base + "/unlock", headers=manager).status_code, 200)


    def test_stationary_ownership_is_enforced_on_both_save_routes_and_lock(self):
        owner = self.headers(self.login("stationary_doctor", "Doctor123"))
        other = self.headers(self.login("stationary_doctor_2", "Doctor123"))
        ambulatory = self.headers(self.login("ambulatory_doctor", "Doctor123"))
        leader = self.headers(self.login())
        created = self.client.post("/api/patients", headers=owner, json={"center": "rights-test"})
        self.assertEqual(created.status_code, 200, created.text)
        base = f"/api/patients/{created.json()['id']}"
        for section in range(1, 16):
            body = {"sections": {str(section): {"test": "ownership-test"}}}
            self.assertEqual(self.client.put(base+"/sections", headers=owner, json=body).status_code, 200 if section <= 10 else 403)
            self.assertEqual(self.client.put(base+"/sections", headers=other, json=body).status_code, 403)
            self.assertEqual(self.client.put(base+"/sections", headers=ambulatory, json=body).status_code, 200 if section >= 11 else 403)
            self.assertEqual(self.client.put(base+"/sections", headers=leader, json=body).status_code, 200)
        self.assertEqual(self.client.put(base+"/section?section=1", headers=other, json={"values": {}}).status_code, 403)
        self.assertEqual(self.client.put(base+"/section?section=1", headers=owner, json={"values": {}}).status_code, 200)
        self.assertEqual(self.client.post(base+"/lock", headers=other).status_code, 403)
        self.assertEqual(self.client.post(base+"/lock", headers=ambulatory).status_code, 200)
        self.assertEqual(self.client.post(base+"/unlock", headers=ambulatory).status_code, 200)
        self.assertEqual(self.client.post(base+"/lock", headers=owner).status_code, 200)
        self.assertEqual(self.client.post(base+"/unlock", headers=owner).status_code, 200)

    def test_audit_is_protected_even_with_direct_requests(self):
        for name in ("stationary_doctor", "ambulatory_doctor", "stationary_doctor_2"):
            doctor = self.headers(self.login(name, "Doctor123"))
            response = self.client.get("/api/runtime?include_audit=true", headers=doctor)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["audit"], [])
            self.assertEqual(self.client.get("/api/audit", headers=doctor).status_code, 403)
            self.assertEqual(self.client.post("/api/reset-demo", headers=doctor).status_code, 403)
        leader = self.headers(self.login())
        self.assertTrue(self.client.get("/api/audit", headers=leader).json())
        compact = self.client.get("/api/runtime?include_audit=false&include_files=false", headers=leader).json()
        self.assertEqual(compact["audit"], [])
        self.assertEqual(compact["files"], [])
        self.assertTrue(compact["patients"])
        self.assertEqual(self.client.get("/api/file-index", headers=leader).status_code, 200)

    def test_wal_is_enabled_without_lowering_durability(self):
        with engine.connect() as connection:
            self.assertEqual(connection.exec_driver_sql("PRAGMA journal_mode").scalar(), "wal")
            self.assertEqual(connection.exec_driver_sql("PRAGMA synchronous").scalar(), 2)

    def test_runtime_preserves_clinical_data_and_metadata(self):
        leader = self.headers(self.login())
        created = self.client.post("/api/patients", headers=leader, json={
            "center": 'Центр "Тест"', "values": {"fio": 'Тест "кавычки" </script> & новая\nстрока'}
        })
        self.assertEqual(created.status_code, 200)
        with SessionLocal() as db:
            expected = [patient_to_dict(patient, users_map(db)) for patient in db.query(Patient).order_by(Patient.id).all()]
        response = self.client.get("/api/runtime", headers=leader)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["patients"], expected)

    def test_excel_optimized_export_matches_original_lookup_for_modern_and_legacy(self):
        import io
        import json
        import zipfile
        from app import brazhnikov as workbook
        from app.crf import empty_blocks, CRF_SCHEMA
        blocks = empty_blocks()
        for fields in blocks.values():
            for field in fields:
                field["value"] = 'Значение & < > " ' + field["key"]
        modern = Patient(operation_date="01.11.2026", blocks_json=json.dumps(blocks, ensure_ascii=False))
        for fields in blocks.values():
            for field in fields:
                field.pop("key", None)
        legacy = Patient(operation_date="02.11.2026", blocks_json=json.dumps(blocks, ensure_ascii=False))
        patients = [modern, legacy]
        actual = workbook.build_final_workbook(patients)
        def original(patient, columns, fields, row):
            blocks = json.loads(patient.blocks_json)
            return ''.join(workbook._cell(column, row, value)
                           for (column, _), field in zip(columns, fields) if field is not None
                           for value in [workbook._field_value(patient, blocks, field)] if value != '')
        with patch.object(workbook, "_patient_cells", original):
            expected = workbook.build_final_workbook(patients)
        with zipfile.ZipFile(io.BytesIO(actual)) as result, zipfile.ZipFile(io.BytesIO(expected)) as reference:
            self.assertEqual(result.namelist(), reference.namelist())
            for name in result.namelist():
                self.assertEqual(result.read(name), reference.read(name), name)

if __name__ == "__main__":
    unittest.main()
