"""Unit tests for the per-job SQLite store (api/src/job_db.py)."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

# Match the import-path setup used by other a_unit tests in this package.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

import job_db  # noqa: E402


def test_db_path_for_job_uses_job_subdir(tmp_path: Path) -> None:
    db_path = job_db.db_path_for_job(tmp_path, "abc-123")
    assert db_path == tmp_path / "abc-123" / job_db.JOB_DB_FILENAME


def test_write_finished_job_round_trips_input_and_results(tmp_path: Path) -> None:
    job_id = "round-trip-job"
    seq_regions = [
        {"unique_entry_id": "0_TP53", "base_seq_name": "TP53", "species": "Homo sapiens"},
        {"unique_entry_id": "1_Trp53", "base_seq_name": "Trp53", "species": "Mus musculus"},
    ]
    alignment_bytes = b">TP53\nMEEPQSDPSV\n>Trp53\nMEESQSDISL\n"
    seq_info_bytes = b'{"sequences": [{"id": "TP53"}, {"id": "Trp53"}]}'

    db_path = job_db.db_path_for_job(tmp_path, job_id)
    job_db.write_finished_job(
        db_path=db_path,
        job_id=job_id,
        seq_regions=seq_regions,
        alignment_bytes=alignment_bytes,
        seq_info_bytes=seq_info_bytes,
    )

    assert db_path.exists()

    metadata = job_db.read_metadata(db_path)
    assert metadata["job_id"] == job_id
    assert metadata["input_count"] == "2"
    assert metadata["schema_version"] == job_db.SCHEMA_VERSION
    assert "completed_at" in metadata

    regions = job_db.read_input_seq_regions(db_path)
    assert regions == seq_regions

    # Direct SQL inspection so we catch schema regressions
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT name, mime_type, content FROM results ORDER BY name"
        ).fetchall()
    finally:
        conn.close()

    by_name = {row[0]: (row[1], row[2]) for row in rows}
    assert by_name["alignment"] == ("text/plain", alignment_bytes)
    assert by_name["seq_info"] == ("application/json", seq_info_bytes)


def test_write_finished_job_overwrites_existing_db(tmp_path: Path) -> None:
    job_id = "overwrite-job"
    db_path = job_db.db_path_for_job(tmp_path, job_id)

    job_db.write_finished_job(
        db_path=db_path,
        job_id=job_id,
        seq_regions=[{"v": 1}],
        alignment_bytes=b"first",
        seq_info_bytes=b"first",
    )
    job_db.write_finished_job(
        db_path=db_path,
        job_id=job_id,
        seq_regions=[{"v": 2}],
        alignment_bytes=b"second",
        seq_info_bytes=b"second",
    )

    regions = job_db.read_input_seq_regions(db_path)
    assert regions == [{"v": 2}]


def test_read_helpers_handle_missing_db(tmp_path: Path) -> None:
    db_path = tmp_path / "nope.db"
    assert job_db.read_input_seq_regions(db_path) is None
    assert job_db.read_metadata(db_path) == {}


@pytest.mark.parametrize("attr", ["read_input_seq_regions", "read_metadata"])
def test_read_helpers_tolerate_corrupt_db(tmp_path: Path, attr: str) -> None:
    db_path = tmp_path / "corrupt.db"
    db_path.write_bytes(b"not a sqlite database")
    fn = getattr(job_db, attr)
    # read_input_seq_regions returns None, read_metadata returns {}
    result = fn(db_path)
    assert result is None or result == {}
