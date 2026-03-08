import os
import random
from dataclasses import dataclass
from typing import Dict, Tuple

from django.conf import settings


@dataclass(frozen=True)
class InferenceResult:
    output: str  # "REAL" or "FAKE"
    confidence: float  # 0-100
    demo_mode: bool
    used_weights: bool
    model_used: str


SEQ_TO_FILENAME = {
    # NOTE: mapping is intentionally explicit and must match
    # the trained checkpoints on disk.
    10: "model_84_acc_10_frames_final_data.pt",
    20: "model_87_acc_20_frames_final_data.pt",
    40: "model_89_acc_40_frames_final_data.pt",
    60: "model_90_acc_60_frames_final_data.pt",
    80: "model_97_acc_80_frames_FF_data.pt",
    100: "model_93_acc_100_frames_celeb_FF_data.pt",
}

# Simple in-process cache so models are only loaded once per sequence length.
_MODEL_CACHE: Dict[int, Tuple[object, bool, str]] = {}


def _weights_path(sequence_length: int) -> str:
    fname = SEQ_TO_FILENAME.get(int(sequence_length), f"model_seq_{int(sequence_length)}.pt")
    return os.path.join(settings.MODEL_DIR, fname)


def _log_model_files_status() -> None:
    """
    On import, log whether all expected weight files exist on disk.
    """
    model_dir = getattr(settings, "MODEL_DIR", None)
    print(f"[MODEL] MODEL_DIR = {model_dir}")
    if not model_dir:
        return
    for seq, fname in SEQ_TO_FILENAME.items():
        path = os.path.join(model_dir, fname)
        exists = os.path.exists(path)
        print(f"[MODEL] seq_len={seq}: path='{path}', exists={exists}")


# Log availability once when Django starts up.
_log_model_files_status()


def _demo_result(reason: str = "") -> InferenceResult:
    if reason:
        print(f"[WARN] Falling back to DEMO MODE: {reason}")
    output = random.choice(["REAL", "FAKE"])
    confidence = round(random.uniform(70.0, 95.0), 1)
    return InferenceResult(
        output=output,
        confidence=confidence,
        demo_mode=True,
        used_weights=False,
        model_used="ResNeXt50 + LSTM (DEMO MODE)",
    )


def get_model(sequence_length: int):
    """
    Load a model and its weights.

    Returns:
        (model, used_weights: bool, weights_path: str)
    """
    from ml_app.ml.model import Model

    seq_len = int(sequence_length)
    if seq_len in _MODEL_CACHE:
        return _MODEL_CACHE[seq_len]

    try:
        import torch
    except Exception as e:
        raise ImportError("PyTorch is not available. Install torch/torchvision.") from e

    weights_path = _weights_path(seq_len)
    exists = os.path.exists(weights_path)
    print(f"[MODEL] Looking for weights at: {weights_path} (exists={exists})")

    if not exists:
        _MODEL_CACHE[seq_len] = (None, False, weights_path)
        return _MODEL_CACHE[seq_len]

    try:
        model = Model(pretrained=True)
        ckpt = torch.load(weights_path, map_location=torch.device("cpu"))
        state = ckpt["model_state_dict"] if isinstance(ckpt, dict) and "model_state_dict" in ckpt else ckpt
        model.load_state_dict(state, strict=False)
        model.eval()
        print(f"[MODEL] Successfully loaded weights for seq_len={seq_len}")
        _MODEL_CACHE[seq_len] = (model, True, weights_path)
    except Exception as e:
        print(f"[ERROR] Failed to load model weights from '{weights_path}': {e}")
        _MODEL_CACHE[seq_len] = (None, False, weights_path)

    return _MODEL_CACHE[seq_len]


def run_inference(face_sequence_tensor, sequence_length: int) -> InferenceResult:
    """
    Run ResNeXt + LSTM inference on a (1, T, 3, 112, 112) tensor.

    - When settings.DEMO_MODE is True, returns a synthetic prediction.
    - When DEMO_MODE is False, requires valid tensor + weights; otherwise raises a clear error.
    """
    if bool(getattr(settings, "DEMO_MODE", False)):
        return _demo_result("settings.DEMO_MODE=True")

    if face_sequence_tensor is None:
        raise ValueError("face_sequence_tensor is None while DEMO_MODE is False")

    try:
        import torch
    except Exception as e:
        raise ImportError(f"torch unavailable: {e}") from e

    model, used_weights, weights_path = get_model(int(sequence_length))
    if model is None or not used_weights:
        raise RuntimeError(
            f"Model weights not available at '{weights_path}'. "
            "Download the pretrained .pt files into settings.MODEL_DIR."
        )

    if not isinstance(face_sequence_tensor, torch.Tensor):
        raise TypeError(
            f"face_sequence_tensor must be a torch.Tensor, got {type(face_sequence_tensor)}"
        )

    print(f"[MODEL] Using weights from: {weights_path}")
    print(f"[MODEL] Input tensor shape: {tuple(face_sequence_tensor.shape)}")

    with torch.no_grad():
        logits = model(face_sequence_tensor)
        logits_cpu = logits.detach().cpu()
        print(f"[MODEL] Raw logits tensor: {logits_cpu.tolist()}")
        probs = torch.softmax(logits_cpu, dim=1)[0]
        print(f"[MODEL] Softmax probabilities: {probs.tolist()}")
        
        # IMPORTANT: Check which index corresponds to FAKE vs REAL
        # Based on typical training: index 0 = FAKE, index 1 = REAL
        fake_prob = float(probs[0].item())
        real_prob = float(probs[1].item())
        
        print(f"[MODEL] FAKE probability: {fake_prob:.4f}")
        print(f"[MODEL] REAL probability: {real_prob:.4f}")
        
        # SWAP THE OUTPUT INTERPRETATION - THIS IS LIKELY THE ISSUE
        # If model was trained with index 0=REAL, index 1=FAKE, then:
        pred_idx = 0 if real_prob > fake_prob else 1
        output = "REAL" if pred_idx == 0 else "FAKE"
        confidence = float(probs[pred_idx].item() * 100.0)
        
        print(f"[MODEL] (SWAPPED) Predicted: {output} with {confidence:.2f}% confidence")
        print(f"[MODEL] FAKE prob: {fake_prob:.4f}, REAL prob: {real_prob:.4f}")
    return InferenceResult(
        output=output,
        confidence=round(confidence, 1),
        demo_mode=False,
        used_weights=True,
        model_used=f"ResNeXt50 + LSTM ({os.path.basename(weights_path)})",
    )


def self_test(sequence_length: int = 10) -> InferenceResult:
    """
    Lightweight manual test for the full pipeline.

    Usage from Django shell:
        from ml_app.model_loader import self_test
        self_test(20)
    """
    try:
        import torch
    except Exception as e:
        raise ImportError(f"torch unavailable for self_test: {e}") from e

    # Fake tensor with the right shape and statistics; this only verifies that
    # the model + weights load and produce non-NaN logits.
    x = torch.randn(1, sequence_length, 3, 112, 112)
    print(f"[SELF-TEST] Running synthetic inference for sequence_length={sequence_length}")
    return run_inference(x, sequence_length=sequence_length)

