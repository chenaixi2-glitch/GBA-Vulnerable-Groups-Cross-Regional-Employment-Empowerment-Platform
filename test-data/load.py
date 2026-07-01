"""Load canonical test fixtures from test-data/."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read_text(*parts: str) -> str:
    return (ROOT.joinpath(*parts)).read_text(encoding="utf-8").strip()


def read_json(*parts: str):
    return json.loads((ROOT.joinpath(*parts)).read_text(encoding="utf-8"))


# Senior Full Stack Developer — real API integration tests
SAMPLE_PROFILE_TEXT = read_text("senior-fullstack", "profile.txt")
SAMPLE_JD_TEXT = read_text("senior-fullstack", "jd.txt")
_messages = read_json("senior-fullstack", "messages.json")
GENERATE_RESUME_MESSAGE = _messages["generateResume"]
INTERVIEW_START_MESSAGE = _messages["interviewStart"]

# Alex Chen — mock / HTML rendering tests
SAMPLE_RESUME_HTML = read_text("alex-chen", "resume-en.html")

# Aixi Chen — resume E2E fixtures
AIXI_PROFILE_PHOTO = ROOT / "aixi" / "profile-photo.jpg"
