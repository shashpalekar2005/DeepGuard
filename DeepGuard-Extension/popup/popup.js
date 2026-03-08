(function() {
  let backendUrl = 'http://127.0.0.1:8000';
  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingStartTime = null;
  let recordingTimer = null;
  let recordingDuration = 3000;
  let selectedFile = null;

  // DOM Elements
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');
  
  // Capture elements
  const previewVideo = document.querySelector('.preview-video');
  const previewIdle = document.querySelector('.preview-idle');
  const recBadge = document.querySelector('.rec-badge');
  const recTimer = document.querySelector('.rec-timer');
  const recordBtn = document.getElementById('record-btn');
  const durationPills = document.querySelectorAll('.pill');
  const captureResult = document.getElementById('capture-result');
  const captureVerdict = document.getElementById('capture-verdict');
  const captureSubtext = document.getElementById('capture-subtext');
  const captureConfidence = document.getElementById('capture-confidence');
  const captureBarFill = document.getElementById('capture-bar-fill');
  const captureReport = document.getElementById('capture-report');
  const captureAgain = document.getElementById('capture-again');
  
  // Upload elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileInfo = document.getElementById('file-info');
  const modelSelect = document.getElementById('model-select');
  const analyzeBtn = document.getElementById('analyze-btn');
  const uploadProgress = document.getElementById('upload-progress');
  const uploadResult = document.getElementById('upload-result');
  const uploadVerdict = document.getElementById('upload-verdict');
  const uploadSubtext = document.getElementById('upload-subtext');
  const uploadConfidence = document.getElementById('upload-confidence');
  const uploadBarFill = document.getElementById('upload-bar-fill');
  const uploadReport = document.getElementById('upload-report');
  const uploadAgain = document.getElementById('upload-again');
  
  // Scanner elements
  const scanBtn = document.getElementById('scan-btn');
  const videoList = document.getElementById('video-list');
  
  // Footer
  const openAppBtn = document.getElementById('open-app');

  // Initialize
  function init() {
    setupEventListeners();
    checkBackendStatus();
    loadStoredSettings();
  }

  function setupEventListeners() {
    // Tab switching
    tabs.forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Duration pills
    durationPills.forEach(pill => {
      pill.addEventListener('click', () => selectDuration(pill));
    });

    // Recording
    recordBtn.addEventListener('click', toggleRecording);

    // Upload
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('drop', handleDrop);
    dropZone.addEventListener('dragleave', handleDragLeave);
    fileInput.addEventListener('change', handleFileSelect);
    analyzeBtn.addEventListener('click', analyzeVideo);

    // Scanner
    scanBtn.addEventListener('click', scanPage);

    // Result actions
    captureAgain.addEventListener('click', resetCapture);
    captureReport.addEventListener('click', () => openReport('capture'));
    uploadAgain.addEventListener('click', resetUpload);
    uploadReport.addEventListener('click', () => openReport('upload'));

    // Footer
    openAppBtn.addEventListener('click', () => chrome.tabs.create({ url: backendUrl }));
  }

  async function checkBackendStatus() {
    try {
      const response = await fetch(`${backendUrl}/api/status/`, {
        headers: { 'X-Requested-With': 'DeepGuard-Extension' }
      });
      
      if (response.ok) {
        updateStatus(true);
      } else {
        updateStatus(false);
      }
    } catch (error) {
      updateStatus(false);
    }
  }

  function updateStatus(isOnline) {
    if (isOnline) {
      statusDot.classList.remove('offline');
      statusText.textContent = 'online';
    } else {
      statusDot.classList.add('offline');
      statusText.textContent = 'offline';
    }
  }

  function switchTab(tabName) {
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
  }

  function selectDuration(pill) {
    durationPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    recordingDuration = parseInt(pill.dataset.seconds) * 1000;
  }

  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' },
        audio: false
      });

      previewVideo.srcObject = stream;
      previewVideo.style.display = 'block';
      previewIdle.style.display = 'none';
      recBadge.style.display = 'flex';
      recTimer.style.display = 'block';

      recordBtn.classList.add('recording');
      recordBtn.querySelector('.btn-text').textContent = 'Stop & Analyze';
      recordBtn.querySelector('.btn-spinner').style.display = 'none';

      isRecording = true;
      recordedChunks = [];
      recordingStartTime = Date.now();

      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = handleRecordingStop;
      mediaRecorder.start();

      startTimer();

      setTimeout(() => {
        if (isRecording) {
          stopRecording();
        }
      }, recordingDuration);

    } catch (error) {
      console.error('Error starting recording:', error);
      showError('Failed to start screen recording');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    if (previewVideo.srcObject) {
      previewVideo.srcObject.getTracks().forEach(track => track.stop());
      previewVideo.style.display = 'none';
    }

    previewIdle.style.display = 'flex';
    recBadge.style.display = 'none';
    recTimer.style.display = 'none';

    recordBtn.classList.remove('recording');
    recordBtn.querySelector('.btn-text').textContent = 'Start Recording';

    isRecording = false;
    stopTimer();
  }

  function handleRecordingStop() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    analyzeRecording(blob);
  }

  function startTimer() {
    recordingTimer = setInterval(() => {
      const elapsed = Date.now() - recordingStartTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const displaySeconds = seconds % 60;
      
      recTimer.textContent = `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
    }, 100);
  }

  function stopTimer() {
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    recTimer.textContent = '00:00';
  }

  async function analyzeRecording(blob) {
    try {
      showCaptureResult('Analyzing...', 'Processing your recording...', 0);
      
      const formData = new FormData();
      formData.append('screen_video', blob, 'screen-recording.webm');
      formData.append('sequence_length', '10');

      const response = await fetch(`${backendUrl}/api/analyze-screen/`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'DeepGuard-Extension' },
        body: formData
      });

      const result = await response.json();
      const verdict = result.verdict.toUpperCase();
      const confidence = result.confidence;
      
      showCaptureResult(verdict, verdict === 'FAKE' ? 'deepfake detected' : 'authentic content', confidence);
      
    } catch (error) {
      console.error('Error analyzing recording:', error);
      showCaptureResult('ERROR', 'Analysis failed', 0);
    }
  }

  function showCaptureResult(verdict, subtext, confidence) {
    captureResult.classList.add('visible');
    captureVerdict.textContent = verdict;
    captureSubtext.textContent = subtext;
    
    animateConfidence(captureConfidence, confidence);
    
    captureBarFill.style.width = `${confidence}%`;
    captureBarFill.className = `confidence-bar-fill ${verdict.toLowerCase()}`;
    
    captureVerdict.className = `result-verdict ${verdict.toLowerCase()}`;
  }

  function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('hover');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    dropZone.classList.remove('hover');
  }

  function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('hover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleFile(file) {
    if (!file.type.startsWith('video/')) {
      showError('Please select a video file');
      return;
    }

    selectedFile = file;
    dropZone.classList.add('has-file');
    
    const fileSize = (file.size / 1024 / 1024).toFixed(1);
    fileInfo.innerHTML = `
      <div class="drop-zone-filename">${file.name}</div>
      <div class="drop-zone-size">${fileSize} MB</div>
    `;
  }

  async function analyzeVideo() {
    if (!selectedFile) {
      showError('Please select a video file');
      return;
    }

    try {
      analyzeBtn.querySelector('.btn-text').textContent = 'Analyzing';
      analyzeBtn.querySelector('.btn-spinner').style.display = 'block';
      uploadProgress.style.display = 'block';

      const formData = new FormData();
      formData.append('video', selectedFile);
      formData.append('sequence_length', modelSelect.value);

      const response = await fetch(`${backendUrl}/api/analyze-video/`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'DeepGuard-Extension' },
        body: formData
      });

      const result = await response.json();
      const verdict = result.verdict.toUpperCase();
      const confidence = result.confidence;
      
      showUploadResult(verdict, verdict === 'FAKE' ? 'deepfake detected' : 'authentic content', confidence);
      
    } catch (error) {
      console.error('Error analyzing video:', error);
      showUploadResult('ERROR', 'Analysis failed', 0);
    } finally {
      analyzeBtn.querySelector('.btn-text').textContent = 'Analyze Video';
      analyzeBtn.querySelector('.btn-spinner').style.display = 'none';
      uploadProgress.style.display = 'none';
    }
  }

  function showUploadResult(verdict, subtext, confidence) {
    uploadResult.classList.add('visible');
    uploadVerdict.textContent = verdict;
    uploadSubtext.textContent = subtext;
    
    animateConfidence(uploadConfidence, confidence);
    
    uploadBarFill.style.width = `${confidence}%`;
    uploadBarFill.className = `confidence-bar-fill ${verdict.toLowerCase()}`;
    
    uploadVerdict.className = `result-verdict ${verdict.toLowerCase()}`;
  }

  async function scanPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: findVideosOnPage
      });

      const videos = results[0]?.result || [];
      displayVideos(videos);
      
    } catch (error) {
      console.error('Error scanning page:', error);
      showError('Failed to scan page for videos');
    }
  }

  function displayVideos(videos) {
    if (videos.length === 0) {
      videoList.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" width="24" height="24" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 1L2 4V7C2 9.5 4.5 11.5 7 12.5C9.5 11.5 12 9.5 12 7V4L7 1Z" stroke="#1e293b" stroke-width="1" fill="none"/>
            <circle cx="7" cy="6.5" r="2" stroke="#1e293b" stroke-width="1" fill="none"/>
          </svg>
          <div class="empty-text">No videos detected</div>
          <div class="empty-sub">Click scan to search</div>
        </div>
      `;
      return;
    }

    const videoItems = videos.map(video => {
      const domain = new URL(video.url).hostname;
      return `
        <div class="video-item">
          <svg class="video-item-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4V10L5 7M12 4V10L9 7M1 12H13" stroke="#334155" stroke-width="1" stroke-linecap="round"/>
          </svg>
          <div class="video-item-info">
            <div class="video-url">${video.url}</div>
            <div class="video-domain">${domain}</div>
          </div>
          <button class="btn-analyze-inline" onclick="analyzeVideoFromList('${video.url}')">analyze</button>
        </div>
      `;
    }).join('');

    videoList.innerHTML = videoItems;
  }

  function findVideosOnPage() {
    const videos = [];
    const videoElements = document.querySelectorAll('video');
    const iframes = document.querySelectorAll('iframe');
    
    videoElements.forEach((video, index) => {
      if (video.src || video.currentSrc) {
        videos.push({
          url: video.src || video.currentSrc,
          type: 'video',
          index
        });
      }
    });

    iframes.forEach((iframe, index) => {
      const src = iframe.src;
      if (src && (src.includes('youtube.com') || src.includes('vimeo.com'))) {
        videos.push({
          url: src,
          type: 'iframe',
          index
        });
      }
    });

    return videos;
  }

  function animateConfidence(element, targetValue) {
    const startValue = 0;
    const duration = 800;
    const startTime = Date.now();

    function update() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentValue = startValue + (targetValue - startValue) * easeOutCubic(progress);
      
      element.textContent = `${currentValue.toFixed(1)}%`;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    update();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function resetCapture() {
    captureResult.classList.remove('visible');
    captureBarFill.style.width = '0%';
  }

  function resetUpload() {
    uploadResult.classList.remove('visible');
    uploadBarFill.style.width = '0%';
    selectedFile = null;
    fileInput.value = '';
    fileInfo.innerHTML = '';
    dropZone.classList.remove('has-file');
  }

  function openReport(type) {
    chrome.tabs.create({ url: `${backendUrl}/` });
  }

  function showError(message) {
    console.error(message);
  }

  async function loadStoredSettings() {
    try {
      const data = await chrome.storage.local.get(['backendUrl']);
      if (data.backendUrl) {
        backendUrl = data.backendUrl;
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // Make video analysis function global
  window.analyzeVideoFromList = async function(videoUrl) {
    try {
      alert(`Analyzing video: ${videoUrl}`);
    } catch (error) {
      console.error('Error analyzing video:', error);
    }
  };

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
