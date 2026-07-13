# 评测结果索引

| 目录 | 说明 | 运行命令 |
|------|------|----------|
| [resume-rag/](resume-rag/) | 简历优化 RAG 指标 | `python -m evaluation.resume_rag.runner` |
| [planner-routing/](planner-routing/) | 意图 F1 + Agent 链路准确率 | `python -m evaluation.planner_routing.runner` |
| [rag-retrieval/](rag-retrieval/) | Recall@K / MRR / NDCG | `python -m evaluation.rag_retrieval.runner --lexical` |
| [chain-consistency/](chain-consistency/) | 跨 Agent 字段传递 | `python -m evaluation.chain_consistency.runner` |
| [monitoring/](monitoring/) | Bad case 采样与人工复核 | `python -m evaluation.monitoring.runner` |
| [resume-rag/human/](resume-rag/human/) | 简历 RAG 人工盲评 | 见 human/README.md |
