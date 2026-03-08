"""
Attempt to download pretrained model weights into settings.MODEL_DIR.

Replace MODEL_BASE_URL with your real artifact host (S3/GCS/GitHub Releases/etc).
This script is intentionally safe: it won't overwrite existing weights unless --force is used.
"""

import argparse
import os
from urllib.parse import urljoin

import requests


SEQ_TO_FILENAME = {
    10: "model_84_acc_10_frames_final_data.pt",
    20: "model_87_acc_20_frames_final_data.pt",
    40: "model_89_acc_40_frames_final_data.pt",
    60: "model_90_acc_60_frames_final_data.pt",
    80: "model_91_acc_80_frames_final_data.pt",
    100: "model_93_acc_100_frames_final_data.pt",
}


def download_file(url: str, dest_path: str) -> None:
    r = requests.get(url, stream=True, timeout=60)
    r.raise_for_status()
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base_url",
        default=os.environ.get("MODEL_BASE_URL", "https://example.com/deepfake-models/"),
        help="Base URL where model .pt files are hosted (placeholder by default).",
    )
    parser.add_argument(
        "--model_dir",
        default=os.environ.get("MODEL_DIR", os.path.join(os.path.dirname(__file__), "models")),
        help="Local directory to save model weights.",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    args = parser.parse_args()

    for seq, fname in SEQ_TO_FILENAME.items():
        url = urljoin(args.base_url.rstrip("/") + "/", fname)
        dest = os.path.join(args.model_dir, fname)
        if os.path.exists(dest) and not args.force:
            print(f"Skip (exists): {dest}")
            continue
        try:
            print(f"Downloading {seq} frames weights from {url} -> {dest}")
            download_file(url, dest)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")
            print("Replace MODEL_BASE_URL with actual trained weights URL.")


if __name__ == "__main__":
    main()

