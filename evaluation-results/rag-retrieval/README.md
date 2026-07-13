# RAG Retrieval Quality — Evaluation Results

Question Agent RAG 检索质量评测（Recall@K、MRR、NDCG@K）。

## 运行

```bash
cd backend
python -m evaluation.rag_retrieval.runner --lexical    # CI / 无 API Key
python -m evaluation.rag_retrieval.runner --embeddings # 生产级 embedding + rerank
pytest tests/test_rag_retrieval_metrics.py -v
```

## Golden Set

`backend/evaluation/rag_retrieval/fixtures/golden_queries.json`
