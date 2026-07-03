"""Checklist should honor profile-editor draft data stored in candidate_profile facts."""

from tools.resume_language_checklist import check_resume_language_requirements
from workflow.state import CandidateProfile, CopilotState, Fact, ProfileBasic


def _draft_profile_state() -> CopilotState:
    return CopilotState(
        session_id="test-session",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(
                name="Alex Chen",
                email="alex.chen@example.com",
                phone="+852 9123 4567",
                city="Hong Kong",
                extras={
                    "summary": (
                        "Customer-focused professional with cross-border e-commerce experience "
                        "and strong communication skills, ready for GBA opportunities."
                    ),
                },
            ),
            facts=[
                Fact(
                    id="edu_1",
                    type="education",
                    content='{"school": "City University of Hong Kong", "major": "Business", "degree": "BBA"}',
                    updated_at="2026-01-01T00:00:00Z",
                ),
                Fact(
                    id="intern_1",
                    type="internship",
                    content="Customer Service Specialist — Global E-Trade Co. (2021–Present)",
                    updated_at="2026-01-01T00:00:00Z",
                ),
            ],
        ),
    )


def test_english_checklist_accepts_profile_editor_draft_without_resume_content_json():
    result = check_resume_language_requirements(_draft_profile_state(), "en")
    required_missing = [
        item for item in result["items"] if item.get("missing") and item.get("severity") == "required"
    ]
    missing_fields = {item["field"] for item in required_missing}
    assert "summary" not in missing_fields
    assert "internships" not in missing_fields
    assert "education" not in missing_fields


def test_english_checklist_accepts_short_profile_editor_summary():
    state = _draft_profile_state()
    state.candidate_profile.profile_basic.extras["summary"] = "Focused CS grad with internship experience."
    result = check_resume_language_requirements(state, "en")
    required_missing = [
        item for item in result["items"] if item.get("missing") and item.get("severity") == "required"
    ]
    missing_fields = {item["field"] for item in required_missing}
    assert "summary" not in missing_fields
