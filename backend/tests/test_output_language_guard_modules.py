"""Tests for per-module language repair and regeneration."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

from agents.json_contracts import ResumeGenerationOutput, ResumeProfileOutput, EducationOutput
from tools.output_language_guard import (
    _module_key_from_path,
    _regenerate_failed_modules,
    find_language_violations,
    repair_language_violations,
)


def test_module_key_groups_education_fields():
    assert _module_key_from_path("profile.education[1].school") == "profile.education[1]"
    assert _module_key_from_path("profile.education[0].major") == "profile.education[0]"
    assert _module_key_from_path("school") == "__root__"


def test_repair_retries_only_failed_fields():
    from agents.json_contracts import ResumeEducationTranslateOutput

    parsed = ResumeEducationTranslateOutput(
        id="edu_1",
        school="清华大学",
        major="Computer Science",
        degree="Bachelor",
    )
    violations = find_language_violations(parsed, "en")
    llm = MagicMock()
    llm.ainvoke = AsyncMock(side_effect=[
        MagicMock(content='{"translations":{}}'),
        MagicMock(content="Tsinghua University"),
    ])
    logger = MagicMock()

    repaired, unresolved = asyncio.run(repair_language_violations(
        parsed,
        violations,
        llm,
        logger,
        "Test Agent",
    ))
    assert repaired.school == "Tsinghua University"
    assert not any(item.path == "school" for item in unresolved)


def test_regenerate_failed_modules_updates_single_education_entry():
    parsed = ResumeGenerationOutput(
        profile=ResumeProfileOutput(
            name="Alex",
            education=[
                EducationOutput(id="edu_1", school="北京大学", major="CS", degree="学士"),
                EducationOutput(id="edu_2", school="Tsinghua University", major="CS", degree="Bachelor"),
            ],
        ),
    )
    violations = [item for item in find_language_violations(parsed, "en") if "education[0]" in item.path]
    assert violations

    fixed = {
        "id": "edu_1",
        "school": "Peking University",
        "major": "Computer Science",
        "degree": "Bachelor",
        "start_date": "",
        "end_date": "",
    }
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=MagicMock(content=json.dumps(fixed)))
    logger = MagicMock()

    result = asyncio.run(_regenerate_failed_modules(
        llm,
        parsed,
        violations,
        "en",
        logger,
        "Test Agent",
    ))
    assert result.profile.education[0].school == "Peking University"
    assert result.profile.education[1].school == "Tsinghua University"
