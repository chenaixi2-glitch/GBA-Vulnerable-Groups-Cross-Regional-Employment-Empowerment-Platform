"""Resume language checklist rules — zh vs zh-TW field requirements."""

from tools.resume_language_checklist import check_resume_language_requirements
from workflow.state import CandidateProfile, CopilotState, Fact, ProfileBasic


def _base_state(**extra_extras) -> CopilotState:
    return CopilotState(
        session_id="test-session",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(
                name="张三",
                email="zhang@example.com",
                phone="13800000000",
                city="广州",
                extras={
                    "photo_url": "data:image/png;base64,abc",
                    **extra_extras,
                },
            ),
            facts=[
                Fact(
                    id="edu_1",
                    type="education",
                    content='{"school": "Sun Yat-sen University", "major": "CS", "degree": "Bachelor"}',
                    updated_at="2026-01-01T00:00:00Z",
                ),
                Fact(
                    id="proj_1",
                    type="project",
                    content="Campus tech club lead — organized hackathon for 200 students",
                    updated_at="2026-01-01T00:00:00Z",
                ),
            ],
        ),
    )


def _required_fields(result: dict) -> set[str]:
    return {
        item["field"]
        for item in result["items"]
        if item.get("missing") and item.get("severity") == "required"
    }


def test_zh_requires_photo_and_any_experience_not_work_alone():
    state = _base_state()
    result = check_resume_language_requirements(state, "zh")
    fields = _required_fields(result)
    assert "photo" not in fields
    assert "internships" not in fields
    assert "experience_any" not in fields


def test_zh_missing_photo_is_required():
    state = _base_state()
    state.candidate_profile.profile_basic.extras.pop("photo_url", None)
    result = check_resume_language_requirements(state, "zh")
    assert "photo" in _required_fields(result)


def test_zh_missing_all_experience_tracks_is_required():
    state = _base_state()
    state.candidate_profile.facts = [
        f for f in state.candidate_profile.facts if f.type != "project"
    ]
    result = check_resume_language_requirements(state, "zh")
    assert "experience_any" in _required_fields(result)
    assert "internships" not in _required_fields(result)


def test_zh_tw_uses_cross_border_rules():
    state = CopilotState(
        session_id="test-session",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(
                name="陳大文",
                email="chan@example.com",
                phone="+852 9123 4567",
                city="Hong Kong",
                extras={
                    "visa_type": "Employment visa",
                    "resident_type": "HK permanent resident",
                },
            ),
            facts=[
                Fact(
                    id="edu_1",
                    type="education",
                    content='{"school": "HKU", "major": "Business", "degree": "BBA"}',
                    updated_at="2026-01-01T00:00:00Z",
                ),
                Fact(
                    id="custom_1",
                    type="custom",
                    content="Volunteer tutor for migrant workers",
                    updated_at="2026-01-01T00:00:00Z",
                ),
            ],
        ),
    )
    result = check_resume_language_requirements(state, "zh-TW")
    fields = _required_fields(result)
    assert "city" not in fields
    assert "summary" not in fields
    assert "internships" not in fields
    assert "experience_any" not in fields
    assert "visa_type" not in fields
    assert "resident_type" not in fields


def test_zh_tw_missing_visa_and_resident_type():
    state = CopilotState(
        session_id="test-session",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(
                name="陳大文",
                email="chan@example.com",
                phone="+852 9123 4567",
            ),
            facts=[
                Fact(
                    id="intern_1",
                    type="internship",
                    content="Intern — Acme Ltd.",
                    updated_at="2026-01-01T00:00:00Z",
                ),
                Fact(
                    id="edu_1",
                    type="education",
                    content='{"school": "HKU", "major": "Business", "degree": "BBA"}',
                    updated_at="2026-01-01T00:00:00Z",
                ),
            ],
        ),
    )
    result = check_resume_language_requirements(state, "zh-TW")
    fields = _required_fields(result)
    assert "visa_type" in fields
    assert "resident_type" in fields


def test_en_uses_optional_summary_city_and_work():
    state = CopilotState(
        session_id="test-session",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(
                name="Alex Chen",
                email="alex@example.com",
                phone="+852 9123 4567",
            ),
            facts=[
                Fact(
                    id="edu_1",
                    type="education",
                    content='{"school": "HKU", "major": "CS", "degree": "BSc"}',
                    updated_at="2026-01-01T00:00:00Z",
                ),
                Fact(
                    id="proj_1",
                    type="project",
                    content="Campus coding club lead",
                    updated_at="2026-01-01T00:00:00Z",
                ),
            ],
        ),
    )
    result = check_resume_language_requirements(state, "en")
    fields = _required_fields(result)
    assert "city" not in fields
    assert "summary" not in fields
    assert "internships" not in fields
    assert "experience_any" not in fields


def test_en_missing_all_experience_tracks_is_required():
    state = CopilotState(
        session_id="test-session",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(
                name="Alex Chen",
                email="alex@example.com",
                phone="+852 9123 4567",
            ),
            facts=[
                Fact(
                    id="edu_1",
                    type="education",
                    content='{"school": "HKU", "major": "CS", "degree": "BSc"}',
                    updated_at="2026-01-01T00:00:00Z",
                ),
            ],
        ),
    )
    result = check_resume_language_requirements(state, "en")
    fields = _required_fields(result)
    assert "experience_any" in fields
    assert "internships" not in fields
