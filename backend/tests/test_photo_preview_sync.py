"""Tests for photo upload → resume preview sync."""

from __future__ import annotations

from api.draft_utils import apply_profile_extras_to_resume_state
from tools.template_renderer import render_resume_html
from workflow.state import (
    CandidateProfile,
    CopilotState,
    ProfileBasic,
    RenderConfig,
    ResumeContent,
    ResumeHtml,
    ResumeContentMeta,
    ResumeProfile,
)


def _state_with_resume(*, photo_in_profile: str = "", photo_in_content: str = "", html: str = "<html></html>") -> CopilotState:
    return CopilotState(
        session_id="sess_test",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(
                name="张三",
                extras={"photo_url": photo_in_profile, "has_photo": "true"} if photo_in_profile else {},
            ),
        ),
        resume_content_json=ResumeContent(
            meta=ResumeContentMeta(language="zh", target_role="工程师"),
            profile=ResumeProfile(
                name="张三",
                email="a@b.com",
                phone="13800000000",
                city="深圳",
                extras={"photo_url": photo_in_content, "has_photo": "true"} if photo_in_content else {},
            ),
        ),
        resume_html=ResumeHtml(html=html),
        render_config=RenderConfig(template_id="default_zh", language="zh"),
    )


def test_apply_profile_extras_clears_html_when_photo_added():
    state = _state_with_resume(photo_in_profile="data:image/jpeg;base64,NEWPHOTO", html="<html>old</html>")
    updated, changed = apply_profile_extras_to_resume_state(state)

    assert changed is True
    assert updated.resume_content_json.profile.extras["photo_url"] == "data:image/jpeg;base64,NEWPHOTO"
    assert updated.resume_html.html == ""


def test_apply_profile_extras_clears_html_when_photo_removed():
    state = _state_with_resume(
        photo_in_profile="",
        photo_in_content="data:image/jpeg;base64,OLDPHOTO",
        html="<html>old</html>",
    )
    state.candidate_profile.profile_basic.extras = {"has_photo": "false"}
    updated, changed = apply_profile_extras_to_resume_state(state)

    assert changed is True
    assert "photo_url" not in updated.resume_content_json.profile.extras
    assert updated.resume_html.html == ""


def test_render_resume_html_includes_photo_for_zh():
    photo = "data:image/jpeg;base64,/9j/photo"
    content = ResumeContent(
        meta=ResumeContentMeta(language="zh", target_role="工程师"),
        profile=ResumeProfile(
            name="张三",
            email="a@b.com",
            phone="13800000000",
            city="深圳",
            extras={"photo_url": photo, "has_photo": "true"},
        ),
        summary="测试摘要",
    )
    html = render_resume_html(content, RenderConfig(template_id="default_zh", language="zh"))
    assert f'src="{photo}"' in html
    assert "profile-photo" in html
