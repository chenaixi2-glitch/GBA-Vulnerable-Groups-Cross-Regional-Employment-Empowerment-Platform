"""English resume template must render Education as its own titled section."""

from tools.template_renderer import render_resume_html
from workflow.state import Education, RenderConfig, ResumeContent, ResumeContentMeta, ResumeProfile


def test_en_resume_renders_education_heading():
    content = ResumeContent(
        profile=ResumeProfile(
            name="Alex Chen",
            email="alex@example.com",
            education=[
                Education(
                    id="edu_1",
                    school="Sun Yat-sen University",
                    major="Economics",
                    degree="BA",
                    start_date="2021-09",
                    end_date="2025-06",
                )
            ],
        ),
        summary="Economics graduate seeking fund operations roles.",
        meta=ResumeContentMeta(language="en", target_role="Fund Operations"),
    )
    html = render_resume_html(
        content,
        RenderConfig(
            template_id="default",
            language="en",
            section_order=["profile", "summary", "education", "skills"],
        ),
    )
    assert "<h2>Education</h2>" in html
    assert "Sun Yat-sen University" in html
    assert 'class="education"' in html
    # Education must not be nested inside the Contact/profile block
    profile_start = html.index('section-profile')
    education_start = html.index("Education</h2>")
    assert education_start > profile_start
    profile_block = html[profile_start:education_start]
    assert "Sun Yat-sen University" not in profile_block
