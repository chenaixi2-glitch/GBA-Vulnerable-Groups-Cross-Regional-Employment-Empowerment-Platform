"""Tests for progressive polish helpers in content_agent."""

from agents.content_agent import (
    _merge_polished_items,
    _placeholder_item_from_fact,
    polish_placeholder_for_language,
)
from agents.json_contracts import ResumeSectionItemOutput
from workflow.state import Fact


def test_polish_placeholder_localized():
    assert "润色" in polish_placeholder_for_language("zh")
    assert polish_placeholder_for_language("en") == "Polishing in progress…"


def test_placeholder_item_preserves_fact_id():
    fact = Fact(id="fact_1", type="internship", content='{"title":"ACME Corp"}')
    item = _placeholder_item_from_fact(fact, placeholder="正在润色…")
    assert item.id == "fact_1"
    assert item.content == "正在润色…"
    assert item.source_refs == ["fact_1"]


def test_merge_polished_items_replaces_placeholder():
    current = [
        ResumeSectionItemOutput(id="fact_1", title="ACME", content="正在润色…", source_refs=["fact_1"]),
        ResumeSectionItemOutput(id="fact_2", title="Side", content="正在润色…", source_refs=["fact_2"]),
    ]
    polished = [
        ResumeSectionItemOutput(id="fact_1", title="ACME Corp", content="Built APIs", source_refs=["fact_1"]),
    ]
    merged = _merge_polished_items(current, polished, pending_fact_ids={"fact_1"})
    assert len(merged) == 2
    assert merged[0].content == "Built APIs"
    assert merged[1].content == "正在润色…"
