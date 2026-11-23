"""Personal EEG Mental State Classifier (pure NumPy, fast & interpretable).

Workflow:
1. User enters a mental state label (e.g., "Deep Work", "Meditation", "Eyes Closed")
   and captures 24-dim EEG band-power feature snapshots while in that state.
2. User trains a personal Gaussian/Centroid classifier (standardized features +
   per-class diagonal Gaussian log-likelihood with softmax probabilities) and
   gets leave-one-out cross-validation accuracy immediately.
3. Once trained, real-time inference predicts the current mental state + confidence
   on every WebSocket frame.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np


class PersonalStateClassifier:
    """Lightweight, persistent personal EEG state classifier."""

    def __init__(self, model_dir: Path) -> None:
        self.model_dir = model_dir
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.dataset_path = self.model_dir / "personal_dataset.json"
        self.model_path = self.model_dir / "personal_model.json"

        self.samples: List[Dict[str, Any]] = []  # [{"label": str, "features": [24 floats], "ts": float}]
        self.model: Optional[Dict[str, Any]] = None
        self._load()

    def _load(self) -> None:
        if self.dataset_path.is_file():
            try:
                self.samples = json.loads(self.dataset_path.read_text(encoding="utf-8"))
            except Exception:
                self.samples = []
        if self.model_path.is_file():
            try:
                self.model = json.loads(self.model_path.read_text(encoding="utf-8"))
            except Exception:
                self.model = None

    def _save_dataset(self) -> None:
        self.dataset_path.write_text(json.dumps(self.samples, indent=2), encoding="utf-8")

    def _save_model(self) -> None:
        if self.model is not None:
            self.model_path.write_text(json.dumps(self.model, indent=2), encoding="utf-8")

    def add_sample(self, label: str, features: List[float]) -> Dict[str, Any]:
        clean_label = label.strip()
        if not clean_label:
            raise ValueError("Label cannot be empty")
        if not features:
            raise ValueError("No EEG feature vector available yet (wait ~2 seconds for buffer to fill)")
        self.samples.append(
            {
                "label": clean_label,
                "features": [float(x) for x in features],
                "ts": round(time.time(), 3),
            }
        )
        self._save_dataset()
        return self.status()

    def clear_dataset(self) -> Dict[str, Any]:
        self.samples = []
        self.model = None
        if self.dataset_path.is_file():
            self.dataset_path.unlink()
        if self.model_path.is_file():
            self.model_path.unlink()
        return self.status()

    def _fit_gaussian(self, X: np.ndarray, y: List[str]) -> Dict[str, Any]:
        mean = np.mean(X, axis=0)
        std = np.std(X, axis=0) + 1e-6
        Xs = (X - mean) / std

        classes = sorted(set(y))
        centroids: Dict[str, List[float]] = {}
        variances: Dict[str, List[float]] = {}
        for cls in classes:
            idx = [i for i, lbl in enumerate(y) if lbl == cls]
            Xc = Xs[idx]
            centroids[cls] = np.mean(Xc, axis=0).tolist()
            # Regularized diagonal variance so small sample counts stay numerically stable
            var = np.var(Xc, axis=0) + 0.35
            variances[cls] = var.tolist()

        return {
            "classes": classes,
            "mean": mean.tolist(),
            "std": std.tolist(),
            "centroids": centroids,
            "variances": variances,
        }

    @staticmethod
    def _predict_with_model(model: Dict[str, Any], features: List[float]) -> Dict[str, Any]:
        x = np.asarray(features, dtype=np.float64)
        mean = np.asarray(model["mean"], dtype=np.float64)
        std = np.asarray(model["std"], dtype=np.float64)
        xs = (x - mean) / std

        classes = model["classes"]
        log_probs: List[float] = []
        for cls in classes:
            mu = np.asarray(model["centroids"][cls], dtype=np.float64)
            var = np.asarray(model["variances"][cls], dtype=np.float64)
            lp = -0.5 * float(np.sum(np.log(2.0 * np.pi * var) + ((xs - mu) ** 2) / var))
            log_probs.append(lp)

        lp_arr = np.asarray(log_probs, dtype=np.float64)
        lp_arr = lp_arr - np.max(lp_arr)
        probs = np.exp(lp_arr)
        probs = probs / (np.sum(probs) + 1e-12)

        best_idx = int(np.argmax(probs))
        return {
            "label": classes[best_idx],
            "confidence": round(float(probs[best_idx]), 3),
            "probabilities": {
                cls: round(float(probs[i]), 3) for i, cls in enumerate(classes)
            },
        }

    def train(self) -> Dict[str, Any]:
        counts = self.label_counts()
        if len(counts) < 2:
            raise ValueError("Collect samples for at least 2 different mental states before training")
        if any(c < 2 for c in counts.values()):
            raise ValueError("Collect at least 2 samples per state for reliable training")

        X = np.asarray([s["features"] for s in self.samples], dtype=np.float64)
        y = [s["label"] for s in self.samples]

        # Leave-one-out cross-validation accuracy
        correct = 0
        for i in range(len(y)):
            mask = np.ones(len(y), dtype=bool)
            mask[i] = False
            y_train = [y[j] for j in range(len(y)) if j != i]
            if len(set(y_train)) < len(counts):
                continue
            sub_model = self._fit_gaussian(X[mask], y_train)
            pred = self._predict_with_model(sub_model, X[i].tolist())
            if pred["label"] == y[i]:
                correct += 1

        loo_acc = round(100.0 * correct / len(y), 1)
        fitted = self._fit_gaussian(X, y)
        fitted["trained_at"] = round(time.time(), 3)
        fitted["num_samples"] = len(y)
        fitted["loo_accuracy_pct"] = loo_acc

        self.model = fitted
        self._save_model()
        return self.status()

    def predict(self, features: Optional[List[float]]) -> Optional[Dict[str, Any]]:
        if self.model is None or not features:
            return None
        if len(features) != len(self.model["mean"]):
            return None
        return self._predict_with_model(self.model, features)

    def label_counts(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for s in self.samples:
            lbl = s["label"]
            counts[lbl] = counts.get(lbl, 0) + 1
        return counts

    def status(self) -> Dict[str, Any]:
        return {
            "total_samples": len(self.samples),
            "label_counts": self.label_counts(),
            "trained": self.model is not None,
            "classes": self.model["classes"] if self.model else [],
            "loo_accuracy_pct": self.model.get("loo_accuracy_pct") if self.model else None,
        }
