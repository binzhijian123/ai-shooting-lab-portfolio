#!/usr/bin/env python3
import argparse
import json
import sys

import numpy as np
from sentence_transformers import SentenceTransformer


BGE_ZH_QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："


def main():
    parser = argparse.ArgumentParser(description="Embed texts for the local vector RAG index.")
    parser.add_argument("--model", default="BAAI/bge-small-zh-v1.5")
    parser.add_argument("--mode", choices=["document", "query"], default="document")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--query-prefix", default=BGE_ZH_QUERY_PREFIX)
    parser.add_argument("--local-files-only", action="store_true", default=True, help="Use cached model only")
    args = parser.parse_args()

    payload = json.load(sys.stdin)
    texts = payload.get("texts") or []
    if not isinstance(texts, list) or not all(isinstance(text, str) for text in texts):
        raise SystemExit("stdin JSON must contain a string array at key 'texts'")

    print(f"[embed-texts] loading model: {args.model}", file=sys.stderr)
    model = SentenceTransformer(args.model, local_files_only=args.local_files_only, trust_remote_code=True)
    input_texts = texts
    if args.mode == "query" and args.query_prefix:
        input_texts = [f"{args.query_prefix}{text}" for text in texts]

    print(f"[embed-texts] encoding {len(input_texts)} texts as {args.mode}", file=sys.stderr)
    embeddings = model.encode(
        input_texts,
        batch_size=args.batch_size,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    embeddings = np.asarray(embeddings, dtype=np.float32)

    json.dump(
        {
            "ok": True,
            "model": args.model,
            "mode": args.mode,
            "dimension": int(embeddings.shape[1]) if embeddings.ndim == 2 else 0,
            "embeddings": embeddings.round(6).tolist(),
        },
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
