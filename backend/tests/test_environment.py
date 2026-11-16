"""Set test paths before any application module initializes SQLAlchemy."""
import os
import tempfile
from pathlib import Path

TEST_DATA = tempfile.TemporaryDirectory(prefix="efetov-tests-")
os.environ["EFETOV_DATA_DIR"] = TEST_DATA.name
os.environ["EFETOV_DB_PATH"] = str(Path(TEST_DATA.name) / "test.db")
