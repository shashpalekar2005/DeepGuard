import os
from dataclasses import dataclass
from typing import List, Optional, Tuple

import cv2
import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms as T


@dataclass(frozen=True)
class VideoSample:
    path: str
    label: int  # 0=fake, 1=real (convention used by train.py)


def default_transforms() -> T.Compose:
    return T.Compose(
        [
            T.Resize((112, 112)),
            T.ToTensor(),
            T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )


def _evenly_spaced_indices(frame_count: int, n: int) -> List[int]:
    if frame_count <= 0:
        return [0] * n
    if n <= 1:
        return [max(frame_count // 2, 0)]
    return np.linspace(0, frame_count - 1, num=n, dtype=int).tolist()


class VideoDataset(Dataset):
    """
    Reads videos with OpenCV, samples N evenly-spaced frames, applies transforms.

    Returns:
      frames: Tensor (T, 3, 112, 112)
      label:  int
    """

    def __init__(
        self,
        samples: List[VideoSample],
        sequence_length: int = 20,
        transform: Optional[T.Compose] = None,
    ):
        self.samples = samples
        self.sequence_length = int(sequence_length)
        if self.sequence_length <= 0:
            raise ValueError("sequence_length must be > 0")
        self.transform = transform or default_transforms()

    def __len__(self) -> int:
        return len(self.samples)

    def _read_frame(self, cap: cv2.VideoCapture, index: int) -> Optional[np.ndarray]:
        # OpenCV random access by setting CAP_PROP_POS_FRAMES. Not perfect for all codecs, but works for training baselines.
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(index))
        ok, frame_bgr = cap.read()
        if not ok or frame_bgr is None:
            return None
        return frame_bgr

    def _frame_to_tensor(self, frame_bgr: np.ndarray) -> torch.Tensor:
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(frame_rgb)
        return self.transform(pil)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        sample = self.samples[idx]
        if not os.path.exists(sample.path):
            raise FileNotFoundError(sample.path)

        cap = cv2.VideoCapture(sample.path)
        if not cap.isOpened():
            raise RuntimeError(f"Unable to open video: {sample.path}")

        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        indices = _evenly_spaced_indices(frame_count, self.sequence_length)

        tensors: List[torch.Tensor] = []
        last_good: Optional[np.ndarray] = None

        for i in indices:
            frame = self._read_frame(cap, i)
            if frame is None:
                # If decode failed, fall back to last good frame (or a black frame).
                if last_good is None:
                    frame = np.zeros((112, 112, 3), dtype=np.uint8)
                else:
                    frame = last_good
            else:
                last_good = frame
            tensors.append(self._frame_to_tensor(frame))

        cap.release()

        frames = torch.stack(tensors, dim=0)  # (T, 3, 112, 112)
        return frames, int(sample.label)

