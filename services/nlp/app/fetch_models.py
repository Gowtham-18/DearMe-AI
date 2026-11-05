"""Download the pinned ONNX models into NLP_MODEL_DIR.

Run at build time (`python -m app.fetch_models`) so a fresh instance starts without
downloading ~110 MB. If it is skipped, the service downloads them on first load instead.
"""

import logging

from .pipeline import MODEL_DIR, download_models

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    download_models()
    print(f"models ready in {MODEL_DIR}")
