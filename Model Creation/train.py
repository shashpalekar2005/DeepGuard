import argparse
import os
import random
from dataclasses import dataclass
from typing import List, Tuple

import torch
from torch import nn
from torch.utils.data import DataLoader
from tqdm import tqdm

from dataset import VideoDataset, VideoSample, default_transforms
from model import Model


VIDEO_EXTS = (".mp4", ".avi", ".mov", ".mkv", ".webm")


def _list_videos(folder: str) -> List[str]:
    out: List[str] = []
    for root, _, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(VIDEO_EXTS):
                out.append(os.path.join(root, f))
    return sorted(out)


def build_samples(data_dir: str) -> List[VideoSample]:
    """
    Expects:
      data_dir/
        real/*.mp4
        fake/*.mp4
    Label convention:
      fake=0, real=1
    """
    real_dir = os.path.join(data_dir, "real")
    fake_dir = os.path.join(data_dir, "fake")
    if not os.path.isdir(real_dir) or not os.path.isdir(fake_dir):
        raise RuntimeError(
            f"Dataset not found. Expected '{real_dir}' and '{fake_dir}'. "
            "Create two folders: real/ and fake/ with video files."
        )

    samples: List[VideoSample] = []
    for p in _list_videos(fake_dir):
        samples.append(VideoSample(path=p, label=0))
    for p in _list_videos(real_dir):
        samples.append(VideoSample(path=p, label=1))
    if not samples:
        raise RuntimeError(f"No videos found under {data_dir}")
    return samples


def split_train_val(samples: List[VideoSample], val_ratio: float, seed: int) -> Tuple[List[VideoSample], List[VideoSample]]:
    rng = random.Random(seed)
    samples = samples[:]
    rng.shuffle(samples)
    n_val = max(1, int(len(samples) * val_ratio))
    val = samples[:n_val]
    train = samples[n_val:]
    return train, val


@torch.no_grad()
def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> Tuple[float, float]:
    model.eval()
    total = 0
    correct = 0
    loss_sum = 0.0
    criterion = nn.CrossEntropyLoss()

    for frames, labels in loader:
        frames = frames.to(device)  # (B, T, 3, 112, 112) after collate? (B,T,3,112,112) if dataset returns (T,3,112,112)
        labels = labels.to(device)

        if frames.ndim == 4:
            frames = frames.unsqueeze(0)
        if frames.ndim == 5 and frames.shape[1] != loader.dataset.sequence_length:
            # If shape is (B,T,...) it's fine; otherwise leave.
            pass

        logits = model(frames)
        loss = criterion(logits, labels)
        preds = logits.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += labels.numel()
        loss_sum += loss.item() * labels.size(0)

    return (loss_sum / max(total, 1)), (correct / max(total, 1))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train ResNeXt+LSTM for deepfake detection.")
    parser.add_argument("--data_dir", required=True, help="Path to dataset root containing real/ and fake/")
    parser.add_argument("--sequence_length", type=int, default=20, help="Number of frames per video sequence")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--num_workers", type=int, default=2)
    parser.add_argument("--val_ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output_dir", default="checkpoints", help="Directory to save best checkpoint")
    parser.add_argument("--freeze_cnn", action="store_true", help="Freeze CNN backbone to speed up training")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    samples = build_samples(args.data_dir)
    train_samples, val_samples = split_train_val(samples, args.val_ratio, args.seed)
    print(f"Train videos: {len(train_samples)} | Val videos: {len(val_samples)}")

    tfm = default_transforms()
    train_ds = VideoDataset(train_samples, sequence_length=args.sequence_length, transform=tfm)
    val_ds = VideoDataset(val_samples, sequence_length=args.sequence_length, transform=tfm)

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=torch.cuda.is_available(),
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=torch.cuda.is_available(),
    )

    model = Model(pretrained=True, freeze_cnn=args.freeze_cnn).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=args.lr)

    os.makedirs(args.output_dir, exist_ok=True)
    best_val_acc = -1.0
    best_path = os.path.join(args.output_dir, f"best_resnext_lstm_{args.sequence_length}f.pt")

    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss = 0.0
        running_correct = 0
        running_total = 0

        pbar = tqdm(train_loader, desc=f"Epoch {epoch}/{args.epochs}", unit="batch")
        for frames, labels in pbar:
            # frames: (B, T, 3, 112, 112) after default collate -> (B, T, 3, 112, 112)
            frames = frames.to(device)
            labels = labels.to(device)

            optimizer.zero_grad(set_to_none=True)
            logits = model(frames)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()

            preds = logits.argmax(dim=1)
            running_correct += (preds == labels).sum().item()
            running_total += labels.numel()
            running_loss += loss.item() * labels.size(0)

            pbar.set_postfix(
                loss=running_loss / max(running_total, 1),
                acc=running_correct / max(running_total, 1),
            )

        train_loss = running_loss / max(running_total, 1)
        train_acc = running_correct / max(running_total, 1)

        val_loss, val_acc = evaluate(model, val_loader, device)

        print(
            f"Epoch {epoch:02d} | "
            f"train loss {train_loss:.4f} acc {train_acc:.4f} | "
            f"val loss {val_loss:.4f} acc {val_acc:.4f}"
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "sequence_length": args.sequence_length,
                    "val_acc": best_val_acc,
                    "epoch": epoch,
                },
                best_path,
            )
            print(f"Saved best checkpoint to: {best_path} (val_acc={best_val_acc:.4f})")

    print(f"Done. Best val accuracy: {best_val_acc:.4f}")


if __name__ == "__main__":
    main()

