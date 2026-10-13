"""Lightweight "meaning" math for Ideas (3D map) and Projects (similarity flagging).

Deliberately not a neural embedding model -- TF-IDF + SVD needs no extra service, no API
key, no GPU, and is good enough to cluster short idea/project blurbs by topic. Swap this
out for real embeddings later (e.g. an embedding API) without touching callers if the
approximation stops being good enough.
"""
import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def texts_to_nd(texts, n_dims=3):
    """Project a list of texts into n-D coordinates such that similar texts end up close together."""
    n = len(texts)
    if n < 2:
        return [[0.0] * n_dims for _ in texts]

    vectorizer = TfidfVectorizer(stop_words="english", max_features=2000)
    matrix = vectorizer.fit_transform(texts)

    n_components = min(n_dims, n - 1, matrix.shape[1])
    if n_components < 1:
        return [[0.0] * n_dims for _ in texts]

    coords = TruncatedSVD(n_components=n_components, random_state=0).fit_transform(matrix)
    if coords.shape[1] < n_dims:
        coords = np.hstack([coords, np.zeros((coords.shape[0], n_dims - coords.shape[1]))])
    return coords.tolist()


def texts_to_3d(texts):
    return texts_to_nd(texts, n_dims=3)


def texts_to_2d(texts):
    return texts_to_nd(texts, n_dims=2)


def similarity(text, corpus_texts):
    """Cosine similarity of `text` against each entry in `corpus_texts`, same order, 0..1 each."""
    if not corpus_texts:
        return []
    vectorizer = TfidfVectorizer(stop_words="english", max_features=2000)
    matrix = vectorizer.fit_transform([text] + corpus_texts)
    return cosine_similarity(matrix[0:1], matrix[1:])[0].tolist()
