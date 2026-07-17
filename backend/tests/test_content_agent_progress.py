"""Tests for progressive polish helpers in content_agent."""

from agents.content_agent import (
    _align_polished_items_to_facts,
    _apply_batch_polish,
    _ensure_section_items_for_facts,
    _fallback_item_from_fact,
    _is_polish_placeholder,
    _mark_section_pending,
    _merge_polished_items,
    _pending_item_from_fact,
    _placeholder_item_from_fact,
    _sweep_polish_placeholders,
    polish_placeholder_for_language,
)
from agents.json_contracts import ResumeGenerationOutput, ResumeSectionItemOutput
from workflow.state import Fact, ResumeContent, ResumeContentMeta, ResumeProfile, SectionItem


def test_polish_placeholder_localized():
    assert "润色" in polish_placeholder_for_language("zh")
    assert polish_placeholder_for_language("en") == "Polishing in progress…"


def test_pending_item_uses_profile_text_not_placeholder():
    fact = Fact(
        id="fact_1",
        type="internship",
        content='{"company":"ACME Corp","responsibilities":"Built APIs"}',
    )
    item = _pending_item_from_fact(fact)
    assert item.id == "fact_1"
    assert not _is_polish_placeholder(item.content)
    assert "Built APIs" in item.content


def test_placeholder_helper_no_longer_writes_placeholder_into_content():
    fact = Fact(id="fact_1", type="internship", content='{"company":"ACME Corp","responsibilities":"Built APIs"}')
    item = _placeholder_item_from_fact(fact, placeholder="正在润色…")
    assert item.id == "fact_1"
    assert item.content != "正在润色…"
    assert not _is_polish_placeholder(item.content)


def test_mark_section_pending_keeps_existing_content():
    resume = ResumeContent(
        profile=ResumeProfile(name="Alex"),
        internships=[
            SectionItem(id="fact_1", title="ACME", content="Old solid text", source_refs=["fact_1"]),
        ],
        meta=ResumeContentMeta(language="en"),
    )
    updated = _mark_section_pending(
        resume,
        section_key="internships",
        fact_ids={"fact_1", "fact_2"},
        append_missing=[
            Fact(id="fact_2", type="internship", content='{"company":"Beta","responsibilities":"Risk"}'),
        ],
    )
    assert updated.internships[0].content == "Old solid text"
    assert updated.internships[1].id == "fact_2"
    assert "Risk" in updated.internships[1].content
    assert not any(_is_polish_placeholder(item.content) for item in updated.internships)


def test_ensure_section_items_for_facts_appends_missing():
    current = [
        ResumeSectionItemOutput(id="fact_1", title="ACME", content="Keep me", source_refs=["fact_1"]),
    ]
    facts = [
        Fact(id="fact_1", type="internship", content='{"company":"ACME"}'),
        Fact(id="fact_2", type="internship", content='{"company":"Beta","responsibilities":"Ops"}'),
    ]
    merged = _ensure_section_items_for_facts(current, facts)
    assert len(merged) == 2
    assert merged[0].content == "Keep me"
    assert merged[1].id == "fact_2"
    assert not _is_polish_placeholder(merged[1].content)


def test_merge_polished_items_replaces_content():
    current = [
        ResumeSectionItemOutput(id="fact_1", title="ACME", content="Draft text", source_refs=["fact_1"]),
        ResumeSectionItemOutput(id="fact_2", title="Side", content="Other draft", source_refs=["fact_2"]),
    ]
    polished = [
        ResumeSectionItemOutput(id="fact_1", title="ACME Corp", content="Built APIs", source_refs=["fact_1"]),
    ]
    merged = _merge_polished_items(current, polished, pending_fact_ids={"fact_1"})
    assert len(merged) == 2
    assert merged[0].content == "Built APIs"
    assert merged[1].content == "Other draft"


def test_align_polished_items_by_title_when_id_wrong():
    facts = [
        Fact(id="fact_1", type="internship", content='{"company":"ACME Corp","responsibilities":"Built APIs"}'),
        Fact(id="fact_2", type="internship", content='{"company":"Beta Inc","responsibilities":"Risk models"}'),
    ]
    polished = [
        ResumeSectionItemOutput(
            id="Data Analysis Intern",
            title="ACME Corp",
            content="Delivered production APIs for risk reporting.",
            source_refs=[],
        ),
        ResumeSectionItemOutput(
            id="Risk Support",
            title="Beta Inc",
            content="Built credit risk scoring pipelines.",
            source_refs=[],
        ),
    ]
    aligned = _align_polished_items_to_facts(polished, facts)
    assert [item.id for item in aligned] == ["fact_1", "fact_2"]
    assert "production APIs" in aligned[0].content
    assert "credit risk" in aligned[1].content
    assert aligned[0].source_refs == ["fact_1"]


def test_align_polished_items_positional_when_titles_diverge():
    facts = [
        Fact(id="fact_a", type="project", content='{"title":"RAG Bot","responsibilities":"Embeddings"}'),
    ]
    polished = [
        ResumeSectionItemOutput(
            id="some-random-id",
            title="AI Assistant",
            content="Shipped a retrieval-augmented chatbot.",
            source_refs=["x"],
        ),
    ]
    aligned = _align_polished_items_to_facts(polished, facts)
    assert aligned[0].id == "fact_a"
    assert "retrieval-augmented" in aligned[0].content


def test_apply_batch_polish_clears_legacy_placeholder_on_id_mismatch():
    facts = [
        Fact(id="fact_1", type="internship", content='{"company":"SZSE","responsibilities":"Data validation"}'),
    ]
    current = [
        ResumeSectionItemOutput(
            id="fact_1",
            title="SZSE",
            content="Polishing in progress…",
            source_refs=["fact_1"],
        ),
    ]
    polished = [
        ResumeSectionItemOutput(
            id="SZSE Intern",
            title="深圳证券交易所",
            content="Validated trading compliance datasets with Python.",
            source_refs=[],
        ),
    ]
    merged = _apply_batch_polish(current, polished, facts)
    assert len(merged) == 1
    assert merged[0].id == "fact_1"
    assert not _is_polish_placeholder(merged[0].content)
    assert "Validated trading" in merged[0].content


def test_apply_batch_polish_falls_back_to_fact_when_empty():
    facts = [
        Fact(
            id="fact_1",
            type="internship",
            content='{"company":"ACME","role":"Intern","responsibilities":"Built dashboards"}',
        ),
    ]
    current = [
        ResumeSectionItemOutput(id="fact_1", title="ACME", content="Draft", source_refs=["fact_1"]),
    ]
    merged = _apply_batch_polish(current, [], facts)
    assert merged[0].id == "fact_1"
    assert not _is_polish_placeholder(merged[0].content)
    assert "dashboards" in merged[0].content


def test_sweep_polish_placeholders_replaces_leftovers():
    facts = [
        Fact(id="fact_1", type="project", content='{"title":"RAG","responsibilities":"Chunking + retrieval"}'),
    ]
    parsed = ResumeGenerationOutput(
        projects=[
            ResumeSectionItemOutput(
                id="fact_1",
                title="RAG",
                content="Polishing in progress…",
                source_refs=["fact_1"],
            ),
        ],
    )
    swept = _sweep_polish_placeholders(parsed, facts)
    assert not _is_polish_placeholder(swept.projects[0].content)
    assert "retrieval" in swept.projects[0].content


def test_fallback_item_from_fact_uses_structured_fields():
    fact = Fact(
        id="fact_x",
        type="internship",
        content='{"company":"Demo Co","role":"Analyst","start_date":"2023-01","end_date":"2023-06","responsibilities":"Month-end close"}',
    )
    item = _fallback_item_from_fact(fact)
    assert item.id == "fact_x"
    assert item.title == "Demo Co — Analyst (2023-01 – 2023-06)"
    assert "Month-end close" in item.content


def test_coerce_section_item_appends_missing_dates():
    from agents.content_agent import _coerce_section_item

    fact = Fact(
        id="fact_1",
        type="internship",
        content='{"company":"ACME","role":"Intern","start_date":"2023-01","end_date":"2023-06"}',
    )
    item = _coerce_section_item(
        ResumeSectionItemOutput(id="fact_1", title="ACME — Intern", content="Built APIs"),
        fact=fact,
    )
    assert item.title == "ACME — Intern (2023-01 – 2023-06)"
    assert item.content == "Built APIs"
def test_coerce_section_item_rebuilds_role_when_llm_returns_company_only():
    """Polish used to ask for company-only titles; structured role must still appear."""
    from agents.content_agent import _coerce_section_item

    fact = Fact(
        id="fact_1",
        type="internship",
        content=(
            '{"company":"ACME","role":"Backend Intern",'
            '"start_date":"2023-01","end_date":"2023-06",'
            '"responsibilities":"Built APIs"}'
        ),
    )
    item = _coerce_section_item(
        ResumeSectionItemOutput(id="fact_1", title="ACME", content="- Built REST APIs"),
        fact=fact,
    )
    assert item.title == "ACME — Backend Intern (2023-01 – 2023-06)"
    assert "Built REST APIs" in item.content
