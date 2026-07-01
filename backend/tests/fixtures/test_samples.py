"""Re-export fixtures from canonical test-data/ folder."""

import importlib.util
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_load_path = _REPO_ROOT / "test-data" / "load.py"
_spec = importlib.util.spec_from_file_location("gba_test_data_load", _load_path)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)

SAMPLE_PROFILE_TEXT = _mod.SAMPLE_PROFILE_TEXT
SAMPLE_JD_TEXT = _mod.SAMPLE_JD_TEXT
SAMPLE_RESUME_HTML = _mod.SAMPLE_RESUME_HTML
GENERATE_RESUME_MESSAGE = _mod.GENERATE_RESUME_MESSAGE
INTERVIEW_START_MESSAGE = _mod.INTERVIEW_START_MESSAGE
LEARNING_PATH_GAP_MESSAGE = _mod.LEARNING_PATH_GAP_MESSAGE
LEARNING_PATH_TIMELINE_MESSAGE = _mod.LEARNING_PATH_TIMELINE_MESSAGE

__all__ = [
    "SAMPLE_PROFILE_TEXT",
    "SAMPLE_JD_TEXT",
    "SAMPLE_RESUME_HTML",
    "GENERATE_RESUME_MESSAGE",
    "INTERVIEW_START_MESSAGE",
    "LEARNING_PATH_GAP_MESSAGE",
    "LEARNING_PATH_TIMELINE_MESSAGE",
]
