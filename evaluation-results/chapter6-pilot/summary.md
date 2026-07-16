# Chapter 6 Pilot Metrics Summary

## Multilingual resume consistency (zh / zh-TW / en / pt)
- Languages: 4; cases: 8 (clean+mixed per language)
- Pass rate: **100.0%** (4/4 language pairs fully correct)

## Structured profile field coverage (fixture proxy)
- Checks passed: **6/6** (accuracy 100.0%)
- Fact types present: award, education, internship, project, skill

## Interview feedback actionability
- Actionable feedback rate: **100.0%** (6/6)
- Judge scores: {'relevance': 80, 'groundedness': 70, 'actionability': 75, 'rationale': 'The response is relevant and covers the internship experience, problem-solving, and job fit, but lacks specific data to support the claims. It is based on real experiences, however, the process is not described in detail. The feedback offers directions for improvement, but the actual steps to take are not clarified.'}
- Question bank fixture: ok=True, count=13, missing_answers=0

## Job–resume match ranking (Node rule scorer)
- Cases: 6
- Ranking agreement vs hand labels: **100.0%**
- Score-band agreement: **83.3%**

## Existing offline evaluations reused
- Planner routing (rule_only): 20/20 intent & chain accuracy
- Chain consistency: 2/5 pass (documents failure modes for incomplete render)
