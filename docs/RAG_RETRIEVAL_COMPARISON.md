# RAG 检索对比报告

本文档由 `scripts/compare-rag-retrieval.mjs` 生成，用于对比当前 sparse RAG 和本地 embedding vector RAG。

## 配置

- Eval set: `data/rag/rag_eval_questions.json`
- TopK: 5
- Sparse index: local_sparse_vector_rag_no_external_api, chunks=173
- Vector index: local_embedding_vector_rag_json_index, chunks=173
- Embedding model: `BAAI/bge-small-zh-v1.5`, dim=512

## 指标

| 方法 | hit@1 | hit@3 | hit@5 | OOD low-confidence |
| --- | ---: | ---: | ---: | ---: |
| Sparse | 1.000 | 1.000 | 1.000 | 1.000 |
| Vector | 1.000 | 1.000 | 1.000 | 1.000 |

## Vector 优于 Sparse 的样例

暂无。

## Vector 需要继续调整的样例

暂无明显 top5 回归。

## 说明

- hit@k 只表示 top-k 检索结果中命中了人工标注的 expected terms/tags，不等于最终回答质量。
- 生成回答时仍必须校验 `cited_slugs` 是否来自 RAG top-k。
- 当前版本是本地 JSON 向量索引 MVP，后续可以替换为 Chroma、FAISS、LanceDB 或 Qdrant。