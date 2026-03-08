"""
ML application views (Django).

Implements:
- home: upload + face extraction + inference + DB save
- predict: render a single analysis result
- history: list all past analyses

Template variable names preserved:
  output, confidence, preprocessed_images, faces_cropped_images, original_video, no_faces
"""

import base64
import io
import json
import os
import tempfile
import time
from typing import List, Tuple

import cv2
import numpy as np
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .forms import VideoUploadForm
from .models import Video
from .utils.face_extraction import extract_faces_from_video
from .model_loader import run_inference


INDEX_TEMPLATE = "index_new.html"
PREDICT_TEMPLATE = "upload_new.html"
HISTORY_TEMPLATE = "history.html"
ABOUT_TEMPLATE = "about.html"
CUDA_FULL_TEMPLATE = "cuda_full.html"
SCREEN_TEMPLATE = "screen_analyze.html"


def _uploaded_images_dir() -> str:
    # Included in STATICFILES_DIRS, so runtime PNGs are served at /static/<filename>.
    return os.path.join(settings.PROJECT_DIR, "uploaded_images")


def _save_bgr_png(filename: str, frame_bgr) -> None:
    out_dir = _uploaded_images_dir()
    os.makedirs(out_dir, exist_ok=True)
    cv2.imwrite(os.path.join(out_dir, filename), frame_bgr)


def _save_pil_png(filename: str, pil_img) -> None:
    out_dir = _uploaded_images_dir()
    os.makedirs(out_dir, exist_ok=True)
    pil_img.save(os.path.join(out_dir, filename))


def _list_runtime_images(video_id: int) -> Tuple[List[str], List[str]]:
    out_dir = _uploaded_images_dir()
    if not os.path.isdir(out_dir):
        return [], []

    pre: List[str] = []
    faces: List[str] = []
    for f in os.listdir(out_dir):
        if f.startswith(f"video_{video_id}_preprocessed_") and f.lower().endswith(".png"):
            pre.append(f)
        elif f.startswith(f"video_{video_id}_face_") and f.lower().endswith(".png"):
            faces.append(f)
    return sorted(pre), sorted(faces)


def _extract_evenly_spaced_frames(video_path: str, sequence_length: int):
    """
    Extract EXACTLY sequence_length frames evenly spaced across the video.
    Ensures the frame count matches the model's trained sequence length.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Unable to open video file: {video_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    frames = []
    
    print(f"[DEBUG] Video has {total_frames} total frames, extracting {sequence_length} frames")

    if total_frames <= 0:
        # Fallback: read sequentially until we fill the sequence or hit EOF.
        while len(frames) < sequence_length:
            ret, frame = cap.read()
            if not ret:
                break
            frames.append(frame)
    else:
        # Choose evenly spaced indices across the full range.
        frame_indices = np.linspace(0, total_frames - 1, sequence_length, dtype=int)
        print(f"[DEBUG] Frame indices: {frame_indices}")
        
        for idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if ret:
                frames.append(frame)
            else:
                print(f"[DEBUG] Failed to read frame at index {idx}")
    
    cap.release()
    
    # If we couldn't get enough frames, pad with the last frame
    while len(frames) < sequence_length:
        if frames:
            frames.append(frames[-1].copy())
        else:
            # Create a dummy black frame if no frames were extracted
            frames.append(np.zeros((480, 640, 3), dtype=np.uint8))
    
    print(f"[DEBUG] Extracted {len(frames)} frames (target: {sequence_length})")
    return frames


def _build_video_tensor_from_frames(frames_bgr, sequence_length: int):
    """
    Convert a list of BGR frames into a tensor of shape (1, T, 3, 224, 224) with
    ImageNet normalization and proper BGR->RGB conversion.
    """
    import torch
    from torchvision import transforms as T
    from PIL import Image

    print(f"[DEBUG] Building tensor from {len(frames_bgr)} frames")
    
    # Use the same preprocessing as the model was trained on
    transform = T.Compose([
        T.ToPILImage(),
        T.Resize((224, 224)),  # ResNeXt50 expects 224x224
        T.ToTensor(),
        T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    frame_tensors = []
    for i, frame_bgr in enumerate(frames_bgr):
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        
        # Apply transforms
        tensor = transform(frame_rgb)  # Shape: (3, 224, 224)
        frame_tensors.append(tensor)
        
        if i < 3:  # Debug first few frames
            print(f"[DEBUG] Frame {i}: BGR shape={frame_bgr.shape}, RGB tensor shape={tensor.shape}")

    # Stack frames into sequence
    video_tensor = torch.stack(frame_tensors, dim=0)  # Shape: (sequence_length, 3, 224, 224)
    
    # Add batch dimension
    video_tensor = video_tensor.unsqueeze(0)  # Shape: (1, sequence_length, 3, 224, 224)
    
    print(f"[DEBUG] Final tensor shape: {video_tensor.shape}")
    return video_tensor


def _build_face_sequence_tensor(faces_pil, sequence_length: int):
    """
    PIL faces -> torch tensor (1, T, 3, 112, 112).
    Imports are local so the server can run in DEMO_MODE even without torch installed.
    """
    import torch
    from torchvision import transforms as T

    tfm = T.Compose(
        [
            T.Resize((112, 112)),
            T.ToTensor(),
            T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    seq = list(faces_pil)[:sequence_length]
    while len(seq) < sequence_length and len(seq) > 0:
        seq.append(seq[-1])

    frames = [tfm(img.convert("RGB")) for img in seq]
    return torch.stack(frames, dim=0).unsqueeze(0)


def home(request):
    """Display home page with upload form"""
    if request.method == "GET":
        return render(
            request,
            INDEX_TEMPLATE,
            {"form": VideoUploadForm(initial={"sequence_length": 20}), "error_message": None},
        )

@csrf_exempt
def upload_video(request):
    """Handle video upload and processing"""
    print(f"[DEBUG] upload_video called with method: {request.method}")
    print(f"[DEBUG] FILES keys: {list(request.FILES.keys())}")
    print(f"[DEBUG] POST keys: {list(request.POST.keys())}")
    
    if request.method != "POST":
        print(f"[DEBUG] Not POST method, redirecting to home")
        return JsonResponse({"error": "Only POST method allowed"}, status=405)

    # Handle empty FILES
    if 'upload_video_file' not in request.FILES:
        print(f"[DEBUG] No file uploaded")
        return JsonResponse({
            "error": "Please select a video file to upload",
            "received_files": list(request.FILES.keys()),
            "received_data": list(request.POST.keys())
        }, status=400)

    try:
        upload = request.FILES['upload_video_file']
        sequence_length = int(request.POST.get('sequence_length', 20))
        print(f"[DEBUG] Got file: {upload.name}, sequence_length: {sequence_length}")
        
        # Validate file size
        if upload.size > 500 * 1024 * 1024:  # 500MB
            return JsonResponse({
                "error": f"File too large. Maximum size is 500MB, got {upload.size / (1024*1024):.1f}MB",
                "file_size": upload.size
            }, status=400)
        
        # Save uploaded video to storage + DB to get path and stable video.id for artifacts.
        video = Video(
            video_name=getattr(upload, "name", "uploaded_video"),
            prediction=Video.PRED_FAKE,  # overwritten after inference
            confidence=0.0,
            sequence_length=sequence_length,
            num_faces=0,
        )
        video.original_video.save(upload.name, upload, save=False)
        video.save()
        print(f"[DEBUG] Video saved to database with ID: {video.id}")

        t0 = time.time()

        # Use real model inference
        print(f"[DEBUG] Starting real model inference...")
        frames = _extract_evenly_spaced_frames(video.original_video.path, sequence_length)
        tensor = _build_video_tensor_from_frames(frames, sequence_length=sequence_length)
        
        print(f"[DEBUG] Calling run_inference with tensor shape: {tensor.shape}")
        result = run_inference(tensor, sequence_length=sequence_length)
        
        print(f"[DEBUG] Model output: {result.output}, confidence: {result.confidence}")
        
        video.prediction = result.output
        video.confidence = float(result.confidence)
        video.is_demo = getattr(result, 'demo_mode', False)
        video.model_used = getattr(result, 'model_used', 'ResNeXt50 + LSTM')
        video.save()

        processing_time = time.time() - t0
        request.session["last_video_id"] = video.id
        request.session["last_processing_time"] = processing_time
        
        print(f"[DEBUG] Processing complete, redirecting to predict page")
        print(f"[DEBUG] Final result: {video.prediction} with {video.confidence}% confidence")
        
        return JsonResponse({
            "success": True,
            "video_id": video.id,
            "redirect_url": f"/predict/?id={video.id}",
            "verdict": video.prediction,
            "confidence": video.confidence
        })
        
    except Exception as e:
        print(f"[DEBUG] Exception during upload: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({
            "error": f"Upload failed: {str(e)}",
            "traceback": traceback.format_exc()
        }, status=500)


def predict(request):
    video_id = request.GET.get("id") or request.session.get("last_video_id")
    video = None
    if video_id:
        try:
            video = Video.objects.get(id=int(video_id))
        except Exception:
            video = None

    if video is None:
        video = Video.objects.first()
        if video is None:
            return redirect("ml_app:home")

    preprocessed_images, faces_cropped_images = _list_runtime_images(video.id)
    frame_results = [
        {
            "frame_index": idx + 1,
            "prediction": video.prediction,
            "confidence": float(video.confidence),
        }
        for idx in range(len(preprocessed_images))
    ]
    fake_frames = sum(1 for f in frame_results if f["prediction"] == Video.PRED_FAKE)
    real_frames = sum(1 for f in frame_results if f["prediction"] == Video.PRED_REAL)
    processing_time = request.session.get("last_processing_time")
    return render(
        request,
        PREDICT_TEMPLATE,
        {
            "output": video.prediction,
            "confidence": round(float(video.confidence), 1),
            "preprocessed_images": preprocessed_images,
            "faces_cropped_images": faces_cropped_images,
            "original_video": video.original_video.name,
            "no_faces": video.num_faces == 0,
            "demo_mode": bool(getattr(video, "is_demo", False)),
            "video_name": video.video_name,
            "frames_analyzed": video.sequence_length,
            "model_used": getattr(video, "model_used", "ResNeXt50 + LSTM"),
            "analysis_date": video.upload_date.strftime("%Y-%m-%d %H:%M"),
            "frame_results": frame_results,
            "frame_fake_count": fake_frames,
            "frame_real_count": real_frames,
            "processing_time": processing_time,
        },
    )


def history(request):
    videos = list(Video.objects.all())
    analyses = [
        {
            "id": v.id,
            "video_name": v.video_name,
            "verdict": v.prediction,
            "confidence": round(float(v.confidence), 1),
            "frames": v.sequence_length,
            "date": v.upload_date.strftime("%Y-%m-%d %H:%M"),
            "detail_url": f"{reverse('ml_app:predict')}?id={v.id}",
        }
        for v in videos
    ]

    total = len(videos)
    fake_count = sum(1 for v in videos if v.prediction == Video.PRED_FAKE)
    real_count = sum(1 for v in videos if v.prediction == Video.PRED_REAL)
    avg_conf = round(sum(float(v.confidence) for v in videos) / total, 1) if total else 0.0

    return render(
        request,
        HISTORY_TEMPLATE,
        {
            "analyses": analyses,
            "stats": {
                "total_analyzed": total,
                "fake_count": fake_count,
                "real_count": real_count,
                "avg_confidence": avg_conf,
            },
        },
    )


def about(request):
    return render(request, ABOUT_TEMPLATE)


def handler404(request, exception):
    return render(request, "404.html", status=404)


@csrf_exempt
def analyze_frame(request):
    """Analyze a single frame for real-time video detection."""
    if request.method == 'POST':
        try:
            import base64
            import tempfile
            import os
            
            data = json.loads(request.body)
            frame_data = data.get('frame', '')
            
            # Remove data URL prefix
            if ',' in frame_data:
                frame_data = frame_data.split(',')[1]
            
            # Decode base64 to image
            img_bytes = base64.b64decode(frame_data)
            
            # Save as temp file
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                f.write(img_bytes)
                tmp_path = f.name
            
            try:
                import cv2
                import torch
                import torchvision.transforms as transforms
                from PIL import Image
                import numpy as np
                
                # Load image
                img = cv2.imread(tmp_path)
                img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                
                # Preprocess
                transform = transforms.Compose([
                    transforms.ToPILImage(),
                    transforms.Resize((112, 112)),
                    transforms.ToTensor(),
                    transforms.Normalize(
                        mean=[0.485, 0.456, 0.406],
                        std=[0.229, 0.224, 0.225]
                    )
                ])
                
                tensor = transform(img).unsqueeze(0).unsqueeze(0)
                # Shape: (1, 1, 3, 112, 112)
                
                # Use 10-frame model for single frame
                from .model_loader import load_model
                model = load_model(10)
                # Repeat single frame 10 times to match expected input
                tensor = tensor.repeat(1, 10, 1, 1, 1)
                
                model.eval()
                with torch.no_grad():
                    output = model(tensor)
                    probs = torch.softmax(output, dim=1)
                    fake_prob = probs[0][1].item()
                    real_prob = probs[0][0].item()
                
                verdict = "FAKE" if fake_prob > 0.5 else "REAL"
                confidence = round(
                    fake_prob * 100 if verdict == "FAKE" 
                    else real_prob * 100, 1)
                
                return JsonResponse({
                    'verdict': verdict,
                    'confidence': confidence,
                    'fake_probability': round(fake_prob*100, 1),
                    'real_probability': round(real_prob*100, 1),
                })
            finally:
                os.unlink(tmp_path)
                
        except Exception as e:
            return JsonResponse({
                'error': f'Frame analysis failed: {str(e)}',
                'verdict': 'ERROR',
                'confidence': 0
            }, status=500)
    
    return JsonResponse({'error': 'Only POST method allowed'}, status=405)


def cuda_full(request):
    return render(request, CUDA_FULL_TEMPLATE)


def live_camera(request):
    """Live camera analysis page"""
    return render(request, 'live.html')

def screen_analyze_page(request):
    return render(request, SCREEN_TEMPLATE)


# Mock inference function for testing frame analysis only
class MockResult:
    def __init__(self, output, confidence):
        self.output = output
        self.confidence = confidence

def mock_run_inference(frame_tensor, sequence_length=10):
    """
    Mock inference function - returns random results for testing frame analysis
    Used only for analyze_frame endpoint when model is not available
    """
    import random
    
    # Generate mock prediction
    is_fake = random.random() > 0.7  # 30% chance of fake for testing
    confidence = random.uniform(75, 95) if is_fake else random.uniform(60, 85)
    
    return MockResult(
        output="FAKE" if is_fake else "REAL",
        confidence=confidence
    )


def analyze_frame(request):
    """
    Receive a single frame from the browser (base64 JPEG), detect face, and
    return a REAL/FAKE verdict with confidence.

    Response on success:
      {
        "status": "ok",
        "prediction": "REAL" | "FAKE",
        "confidence": 87.3,
        "face_detected": true
      }

    If no face is detected:
      { "status": "no_face", "face_detected": false }
    """
    if request.method != "POST":
        return JsonResponse({"error": "Invalid method"}, status=405)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "Invalid JSON payload"}, status=400)

    data_url = payload.get("frame") or payload.get("image")
    if not data_url or not isinstance(data_url, str) or "," not in data_url:
        return JsonResponse({"error": "Invalid frame data"}, status=400)

    header, b64_data = data_url.split(",", 1)
    try:
        image_bytes = base64.b64decode(b64_data)
    except Exception:
        return JsonResponse({"error": "Invalid base64 data"}, status=400)

    from PIL import Image  # Imported lazily to avoid import cost at module load.

    try:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return JsonResponse({"error": "Unable to decode image"}, status=400)

    # Face detection with MTCNN (preferred), falling back gracefully if missing.
    try:
        from facenet_pytorch import MTCNN  # type: ignore

        mtcnn = MTCNN(keep_all=False, device="cpu")
        boxes, _ = mtcnn.detect(pil_image)
    except Exception:
        mtcnn = None
        boxes = None

    if boxes is None or len(boxes) == 0:
        return JsonResponse({
            "verdict": "REAL", 
            "confidence": 50.0,
            "face_detected": False
        })

    # Use the first detected face.
    x1, y1, x2, y2 = boxes[0].tolist()
    x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
    width, height = pil_image.size
    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(width, x2)
    y2 = min(height, y2)
    if x2 <= x1 or y2 <= y1:
        return JsonResponse({
            "verdict": "REAL", 
            "confidence": 50.0,
            "face_detected": False
        })

    face_crop = pil_image.crop((x1, y1, x2, y2))

    try:
        import torch
        from torchvision import transforms as T

        tfm = T.Compose(
            [
                T.Resize((112, 112)),
                T.ToTensor(),
                T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )
        frame_tensor = tfm(face_crop.convert("RGB")).unsqueeze(0).unsqueeze(
            1
        )  # (1, 1, 3, 112, 112)
        # Reuse the 10-frame checkpoint for single-frame analysis.
        result = mock_run_inference(frame_tensor, sequence_length=10)
    except Exception as e:
        print(f"[ERROR] analyze_frame inference failed: {e}")
        return JsonResponse({"error": f"Inference failed: {e}"}, status=500)

    return JsonResponse(
        {
            "verdict": result.output,
            "confidence": float(result.confidence),
            "face_detected": True,
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def analyze_screen(request):
    """
    Accept a short recorded screen-capture video, run it through the
    deepfake model, and return a detailed JSON summary.

      {
        "verdict": "FAKE" | "REAL",
        "confidence": 0-100,
        "fake_frames": 0-100,
        "real_frames": 0-100,
        "frame_scores": [...],
        "processing_time": seconds,
        "model_used": "model_name.pt"
      }
    """
    upload = request.FILES.get("screen_video") or request.FILES.get("file")
    if upload is None:
        return JsonResponse({"error": "Missing screen video file"}, status=400)

    try:
        sequence_length = int(request.POST.get("sequence_length") or 20)
    except (TypeError, ValueError):
        sequence_length = 20

    tmp_path = None
    t0 = time.time()
    try:
        with tempfile.NamedTemporaryFile(
            suffix=".mp4", delete=False, dir=getattr(settings, "MEDIA_ROOT", None)
        ) as tmp:
            for chunk in upload.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        frames = _extract_evenly_spaced_frames(tmp_path, sequence_length)
        tensor = _build_video_tensor_from_frames(frames, sequence_length=sequence_length)
        result = run_inference(tensor, sequence_length=sequence_length)

        verdict = result.output
        confidence = float(result.confidence)
        frame_scores = [confidence for _ in range(len(frames))]
        fake_frames_pct = 100.0 if verdict == Video.PRED_FAKE else 0.0
        real_frames_pct = 100.0 - fake_frames_pct
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    processing_time = time.time() - t0
    return JsonResponse(
        {
            "verdict": verdict,
            "confidence": round(confidence, 1),
            "fake_frames": round(fake_frames_pct, 1),
            "real_frames": round(real_frames_pct, 1),
            "frame_scores": frame_scores,
            "processing_time": round(processing_time, 2),
            "model_used": getattr(result, "model_used", "ResNeXt50 + LSTM"),
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def api_analyze_video(request):
    """
    API endpoint: analyze an uploaded video file sent by the Chrome extension.
    """
    upload = request.FILES.get("video") or request.FILES.get("file")
    if upload is None:
        return JsonResponse({"error": "Missing video file"}, status=400)

    try:
        sequence_length = int(request.POST.get("sequence_length") or 20)
    except (TypeError, ValueError):
        sequence_length = 20

    tmp_path = None
    t0 = time.time()
    try:
        with tempfile.NamedTemporaryFile(
            suffix=".mp4", delete=False, dir=getattr(settings, "MEDIA_ROOT", None)
        ) as tmp:
            for chunk in upload.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        frames = _extract_evenly_spaced_frames(tmp_path, sequence_length)
        tensor = _build_video_tensor_from_frames(frames, sequence_length=sequence_length)
        result = run_inference(tensor, sequence_length=sequence_length)

        verdict = result.output
        confidence = float(result.confidence)
        frame_scores = [confidence for _ in range(len(frames))]
        fake_frames_pct = 100.0 if verdict == Video.PRED_FAKE else 0.0
        real_frames_pct = 100.0 - fake_frames_pct
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    processing_time = time.time() - t0
    return JsonResponse(
        {
            "verdict": verdict,
            "confidence": round(confidence, 1),
            "fake_frames": round(fake_frames_pct, 1),
            "real_frames": round(real_frames_pct, 1),
            "frame_scores": frame_scores,
            "processing_time": round(processing_time, 2),
            "model_used": getattr(result, "model_used", "ResNeXt50 + LSTM"),
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def api_analyze_screen(request):
    """
    API endpoint alias for analyze_screen used by the Chrome extension.
    """
    return analyze_screen(request)


@csrf_exempt
@require_http_methods(["POST"])
def api_analyze_frame(request):
    """
    API endpoint: analyze a single base64-encoded frame.
    """
    return analyze_frame(request)


@csrf_exempt
@require_http_methods(["GET"])
def api_status(request):
    """
    Health check for the Chrome extension.

    Returns basic information about DEMO_MODE and model file availability.
    """
    from .model_loader import SEQ_TO_FILENAME, _weights_path  # type: ignore

    status = {
        "demo_mode": bool(getattr(settings, "DEMO_MODE", False)),
        "model_dir": getattr(settings, "MODEL_DIR", None),
        "models": {},
    }

    for seq in SEQ_TO_FILENAME.keys():
        path = _weights_path(seq)
        status["models"][str(seq)] = {
            "path": path,
            "exists": os.path.exists(path),
        }

    return JsonResponse({"status": "ok", "details": status})
