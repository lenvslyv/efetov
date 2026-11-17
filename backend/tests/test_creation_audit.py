"""Exercise the real patient write handlers with an isolated database."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from test_environment import TEST_DATA

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crf import fields_of_section
from app.database import Base
from app.deps import Actor
from app.main import (
    CreatePatientBody, SaveSectionsBody, SaveBlockBody,
    create_patient, save_sections, save_section, audit_payload,
)
from app.models import AuditEvent, Patient, User
from app.rbac import section_label


class CreationAudit(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        self.actors = {}
        for role in ("leader", "stationary", "ambulatory"):
            user = User(id=role, login=f"{role}_login", role=role, name=role, password_hash="unused")
            self.db.add(user)
            self.actors[role] = Actor(user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_creation_records_all_filled_sections_for_both_creator_roles(self):
        values = {fields_of_section(section)[0]["key"]: f"value-{section}" for section in range(1, 11)}
        for role in ("leader", "stationary"):
            patient = create_patient(CreatePatientBody(center="Center", values=values), self.actors[role], self.db)
            events = self.db.query(AuditEvent).filter(AuditEvent.user_id == role).order_by(AuditEvent.id).all()
            self.assertEqual(len(events), 2)
            self.assertEqual(events[0].action, "Создание карты пациента")
            self.assertEqual(events[1].action, "Заполнение разделов")
            self.assertIn(patient["code"], events[1].details)
            for section in range(1, 11):
                self.assertIn(section_label(section), events[1].details)
            self.assertNotIn(section_label(11), events[1].details)
            self.assertEqual(next(event for event in audit_payload(self.db) if event["action"] == "Заполнение разделов" and event["userId"] == role)["userLogin"], f"{role}_login")

    def test_blank_or_ignored_values_do_not_claim_sections_were_filled(self):
        values = {
            fields_of_section(1)[0]["key"]: "  ",
            fields_of_section(11)[0]["key"]: "must-be-ignored",
            "unknown-field": "not-saved",
        }
        create_patient(CreatePatientBody(center="Center", values=values), self.actors["leader"], self.db)
        self.assertEqual(self.db.query(AuditEvent).count(), 1)

    def test_partial_creation_and_later_edits_keep_all_audit_events(self):
        key = fields_of_section(3)[0]["key"]
        patient = create_patient(CreatePatientBody(center="Center", values={key: "initial"}), self.actors["leader"], self.db)
        initial = self.db.query(AuditEvent).filter(AuditEvent.action == "Заполнение разделов").one()
        self.assertIn(section_label(3), initial.details)
        self.assertNotIn(section_label(1), initial.details)
        save_sections(patient["id"], SaveSectionsBody(sections={str(section): {fields_of_section(section)[0]["key"]: "updated"} for section in range(1, 11)}), self.actors["leader"], self.db)
        save_section(patient["id"], 11, SaveBlockBody(values={fields_of_section(11)[0]["key"]: "follow-up"}), self.actors["ambulatory"], self.db)
        events = self.db.query(AuditEvent).order_by(AuditEvent.id).all()
        self.assertEqual(len(events), 4)
        self.assertIn(section_label(1), events[2].details)
        self.assertIn(section_label(10), events[2].details)
        self.assertEqual(events[2].user_id, "leader")
        self.assertIn(section_label(11), events[3].details)
        self.assertEqual(events[3].user_id, "ambulatory")

    def test_failed_creation_rolls_back_both_patient_and_audit(self):
        key = fields_of_section(1)[0]["key"]
        from fastapi import HTTPException
        with patch.object(self.db, "commit", side_effect=IntegrityError("insert", {}, Exception("failure"))):
            with self.assertRaises(HTTPException):
                create_patient(CreatePatientBody(center="Center", values={key: "initial"}), self.actors["leader"], self.db)
        self.assertEqual(self.db.query(Patient).count(), 0)
        self.assertEqual(self.db.query(AuditEvent).count(), 0)


if __name__ == "__main__":
    unittest.main()
