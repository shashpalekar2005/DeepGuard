"""
Download pretrained ResNeXt+LSTM weights into this project.

Where to place weights:
  - Destination: `Django Application/models/`
  - Django reads weights from `settings.MODEL_DIR`

Where to get real weights:
  - Train on FaceForensics++ (or equivalent) and host the resulting `.pt` files
    on an artifact store (S3/GCS/GitHub Releases).
  - Then run this script with --base-url pointing to that host.

Example:
  python download_weights.py --base-url "https://your-host.example.com/deepfake-weights/"
"""

import argparse
import os
from urllib.parse import urljoin

import requests
from tqdm import tqdm


FILES = [
    "model_84_acc_10_frames_final_data.pt",
    "model_87_acc_20_frames_final_data.pt",
    "model_89_acc_40_frames_final_data.pt",
    "model_90_acc_60_frames_final_data.pt",
    "model_91_acc_80_frames_final_data.pt",
    "model_93_acc_100_frames_final_data.pt",
]


def download(url: str, dest_path: str) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        with open(dest_path, "wb") as f, tqdm(
            total=total if total > 0 else None,
            unit="B",
            unit_scale=True,
            unit_divisor=1024,
            desc=os.path.basename(dest_path),
        ) as bar:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                f.write(chunk)
                bar.update(len(chunk))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        required=True,
        help="Base URL hosting the .pt files (e.g. https://host/path/).",
    )
    parser.add_argument(
        "--dest",
        default=os.path.join(os.path.dirname(__file__), "Django Application", "models"),
        help="Destination directory for weights (default: Django Application/models).",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    args = parser.parse_args()

    base = args.base_url.rstrip("/") + "/"
    for fname in FILES:
        url = urljoin(base, fname)
        dest_path = os.path.join(args.dest, fname)
        if os.path.exists(dest_path) and not args.force:
            print(f"Skip (exists): {dest_path}")
            continue
        print(f"Downloading: {url}")
        download(url, dest_path)
        print(f"Saved: {dest_path}")

    print("Done. You can now set DEMO_MODE=False and run the server.")


if __name__ == "__main__":
    main()

