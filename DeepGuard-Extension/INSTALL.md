# DeepGuard Chrome Extension – Installation & Usage

This guide explains how to install the **DeepGuard - Deepfake Detector** Chrome extension and how to run the local Django backend that powers it.

---

## 1. Load the extension in Chrome

1. Open Chrome.
2. Navigate to `chrome://extensions`.
3. Toggle **Developer mode** on (top-right).
4. Click **“Load unpacked”**.
5. Browse to and select the folder:

   - `Deepfake_detection_using_deep_learning-master/DeepGuard-Extension`

6. You should now see **“DeepGuard - Deepfake Detector”** in the extensions list.
7. Pin the extension to the toolbar for quick access (click the puzzle icon → pin DeepGuard).

> **Note:** The icon PNGs in `DeepGuard-Extension/icons/` are text placeholders.  
> For a polished look, replace them with actual PNG files (16×16, 48×48, 128×128) using a shield/eye logo.

---

## 2. Start the Django backend

The extension talks to your local Django backend at `http://127.0.0.1:8000` by default.

### 2.1. Install dependencies

From the project root (`Deepfake_detection_using_deep_learning-master`):

```bash
cd "Django Application"
python -m venv venv
venv\Scripts\activate  # On Windows PowerShell
pip install -r requirements.txt
```

Make sure you have:

- Python 3.10+  
- PyTorch + torchvision correctly installed for your platform  
- The `.pt` model files placed in:

```text
Django Application\models\
  model_84_acc_10_frames_final_data.pt
  model_87_acc_20_frames_final_data.pt
  model_89_acc_40_frames_final_data.pt
  model_90_acc_60_frames_final_data.pt
  model_97_acc_80_frames_FF_data.pt
  model_93_acc_100_frames_celeb_FF_data.pt
```

When Django starts, it will log (for each sequence length) whether each model file exists in `settings.MODEL_DIR`.

### 2.2. Run migrations and start the server

From `Django Application`:

```bash
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

You should be able to open the web UI at:

```text
http://127.0.0.1:8000
```

If everything is wired correctly, the extension’s header should show **“Backend Connected”** in green.

---

## 3. Using the DeepGuard extension

Click the DeepGuard icon in the Chrome toolbar to open the popup. There are three main tabs.

### 3.1. Screen Capture tab

**What it does:** Captures a short recording of the current tab and sends it to the Django backend to detect deepfakes.

Steps:

1. Open a video page or any content you want to inspect.
2. Open the DeepGuard popup and ensure the **“Screen Capture”** tab is selected.
3. Choose a duration: **3s / 5s / 10s** using the pills.
4. Click **“Start Capture”**:
   - Chrome will capture the current tab as a video stream.
   - A live preview appears in the popup.
   - The **● LIVE** badge turns red and a timer starts.
5. Capture will auto-stop after the selected duration, or you can click **“Stop & Analyze”** to stop early.
6. The recorded clip is converted to a video blob and POSTed to:

   - `POST /api/analyze-screen/`

7. After analysis completes, you’ll see:
   - A **FAKE** (red) or **REAL** (green) verdict banner.
   - A confidence percentage with an animated bar.
   - Buttons:
     - **View Full Report** – opens the Django web app to inspect details.
     - **Analyze Again** – hides the result and starts a new capture.

### 3.2. Upload Video tab

**What it does:** Uploads a local video file for deepfake detection using one of several sequence-length models.

Steps:

1. Switch to the **“Upload Video”** tab.
2. Drag and drop a video file into the dashed zone, or click it to browse.
3. Choose a model from the **Model** dropdown:
   - 10 / 20 / 40 / 60 / 80 / 100 frame variants with corresponding accuracy.
4. Click **“Analyze”**:
   - A progress bar animates while the file is uploaded and analyzed.
   - The video is sent to:

     - `POST /api/analyze-video/` (multipart: `video`, `sequence_length`)

5. Once done, you’ll see:
   - A FAKE/REAL verdict banner.
   - Animated confidence bar & percentage.
   - Buttons:
     - **View Full Report** – opens the full Django web app.
     - **Analyze Again** – clears the result so you can upload another file.

### 3.3. Page Videos tab

**What it does:** Finds `<video>` elements on the current page and lets you send their source to the backend.

Steps:

1. Open a page that contains HTML5 videos.
2. Go to the **“Page Videos”** tab.
3. Click **“Scan Page”**:
   - The content script finds all `<video>` elements and returns their `src` / `currentSrc`.
   - You’ll see a list of cards, one per video:
     - A small thumbnail placeholder.
     - A truncated URL or blob identifier.
     - An **“Analyze”** button.
4. Click **“Analyze”** on any card:
   - The background service worker downloads the video via `fetch()`.
   - It wraps the downloaded blob into a `File` and calls:

     - `DeepGuardAPI.analyzeVideo(backendUrl, file, sequence_length)`

   - The result is stored in history and a desktop notification appears with the verdict and confidence.

> **Overlay buttons:** On many pages you’ll also see a small **“🛡 Analyze”** button overlaid on videos when you hover them.  
> Clicking it sends a message to the background script to analyze that specific video source.

---

## 4. Settings & backend URL

Click the **gear icon** in the popup header to open **Settings**.

- **Backend URL** – the base URL for the Django backend.
  - Default: `http://127.0.0.1:8000`
  - You can change this to any reachable DeepGuard backend (e.g. `http://localhost:8000` or a LAN IP).
- The URL is stored in `chrome.storage.local` and reused across sessions.
- After saving, the popup immediately re-checks the backend status.

---

## 5. How the detection pipeline works

The Django backend exposes JSON APIs which the extension calls:

- `GET /api/status/`
  - Returns health info and availability of each model checkpoint.
- `POST /api/analyze-video/`
  - Accepts a video file (`video`) and `sequence_length`.
  - Uses OpenCV to sample frames evenly across the video.
  - Preprocesses each frame:
    - Resize to `224x224`
    - Convert BGR → RGB
    - Normalize with ImageNet stats:  
      `mean=[0.485, 0.456, 0.406]`, `std=[0.229, 0.224, 0.225]`
    - Stacks into a tensor of shape `(1, seq_len, 3, 224, 224)`.
  - Feeds the tensor into the ResNeXt50 + LSTM model:
    - `model.eval()` with `torch.no_grad()`
    - Applies softmax to logits to obtain REAL/FAKE probabilities.
  - Returns:
    - `verdict` (`REAL` or `FAKE`)
    - `confidence` (0–100)
    - `fake_frames`, `real_frames` (0–100 percentages)
    - `frame_scores` (per-frame confidence list)
    - `processing_time`
    - `model_used`

- `POST /api/analyze-screen/`
  - Same preprocessing pipeline as `/api/analyze-video/`, but accepts a short recording blob (`screen_video`).

- `POST /api/analyze-frame/`
  - Accepts a base64-encoded frame image (`image`).
  - Detects the main face, crops it, and runs the model on a single-frame sequence.

The extension **never uploads videos to any external server** – it talks only to your local DeepGuard backend.

---

## 6. Troubleshooting

### 6.1. Popup shows “Offline”

- Make sure the Django server is running on `http://127.0.0.1:8000`.
- Open `http://127.0.0.1:8000/api/status/` in a browser:
  - If it returns JSON with `"status": "ok"`, the backend is healthy.
- Check that:
  - `CORS_ALLOW_ALL_ORIGINS = True` in `settings.py`.
  - `corsheaders` is installed and added to `INSTALLED_APPS`.
  - `'corsheaders.middleware.CorsMiddleware'` is at the **top** of `MIDDLEWARE`.

### 6.2. “Model weights not available” errors

- Verify that all `.pt` files listed above are present in the `models/` directory.
- Confirm that `MODEL_DIR` in `settings.py` points to the correct path:

  ```python
  MODEL_DIR = os.path.join(BASE_DIR, "models")
  ```

- On startup, the backend logs for each seq_len whether the file exists. Fix missing paths/names and restart the server.

### 6.3. Extension cannot capture screen

- Ensure the extension has `tabCapture` / `desktopCapture` permissions (see `manifest.json`).
- Chrome may ask for permissions the first time you capture – accept any prompts.
- If capture fails repeatedly:
  - Close and reopen the popup.
  - Try restarting the browser.

### 6.4. “Failed to download video” in Page Videos tab

- Some streaming platforms protect content with DRM or block direct `fetch()` access.
- In such cases, DeepGuard may not be able to download the raw video data.
- Try using **Screen Capture** instead of **Page Videos** for that site.

### 6.5. CORS or CSRF issues

- All API endpoints used by the extension are decorated with `@csrf_exempt`.
- `django-cors-headers` is configured to allow all origins and the `X-Extension-Id` header.
- If you change the backend domain/port, make sure it’s still reachable from Chrome and not blocked by a proxy or firewall.

---

You now have a fully wired DeepGuard pipeline:

- Django backend (ResNeXt50 + LSTM) for robust deepfake detection.
- A Chrome extension with:
  - Screen capture analysis
  - Local video upload
  - Page video detection

Use both the web UI and the extension together for the best detection and reporting experience.

