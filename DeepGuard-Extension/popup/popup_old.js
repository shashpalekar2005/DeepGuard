/* global DeepGuardAPI, chrome */

(function () {
  const DEFAULT_BACKEND = DeepGuardAPI && DeepGuardAPI.DEFAULT_BACKEND
    ? DeepGuardAPI.DEFAULT_BACKEND
    : 'http://127.0.0.1:8000';

  let backendUrl = DEFAULT_BACKEND;
  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingStartTime = null;
  let recordingTimer = null;
  let recordingDuration = 3000; // Default 3 seconds
  let analysisResults = [];

  // DOM elements
  const backendStatusEl = document.getElementById('backend-status');
  const statusDotEl = backendStatusEl ? backendStatusEl.querySelector('.dg-status-dot') : null;
  const statusLabelEl = backendStatusEl ? backendStatusEl.querySelector('.dg-status-label') : null;

  const tabButtons = Array.from(document.querySelectorAll('.dg-tab-button'));
  const tabContents = Array.from(document.querySelectorAll('.dg-tab-content'));

  const screenPreview = document.getElementById('screen-preview');
  const screenPlaceholder = document.getElementById('screen-placeholder');
  const recIndicator = document.getElementById('rec-indicator');
  const btnScreenToggle = document.getElementById('btn-screen-toggle');
  const durationSelector = document.getElementById('duration-selector');
  const timerEl = document.getElementById('recording-timer');

  const screenResultCard = document.getElementById('screen-result-card');
  const screenVerdictBanner = document.getElementById('screen-verdict-banner');
  const screenVerdictLabel = document.getElementById('screen-verdict-label');
  const screenVerdictSub = document.getElementById('screen-verdict-sub');
  const screenConfValue = document.getElementById('screen-conf-value');
  const screenConfBarInner = document.getElementById('screen-conf-bar-inner');
  const btnScreenViewReport = document.getElementById('btn-screen-view-report');
  const btnScreenAgain = document.getElementById('btn-screen-again');

  const uploadDropzone = document.getElementById('upload-dropzone');
  const uploadInput = document.getElementById('upload-input');
  const uploadFileLabel = document.getElementById('upload-file-label');
  const modelSelect = document.getElementById('model-select');
  const btnUploadAnalyze = document.getElementById('btn-upload-analyze');
  const uploadProgressShell = document.getElementById('upload-progress-shell');
  const uploadProgressLabel = document.getElementById('upload-progress-label');
  const uploadProgressPercent = document.getElementById('upload-progress-percent');
  const uploadProgressInner = document.getElementById('upload-progress-inner');
  const uploadResultCard = document.getElementById('upload-result-card');
  const uploadVerdictBanner = document.getElementById('upload-verdict-banner');
  const uploadVerdictLabel = document.getElementById('upload-verdict-label');
  const uploadVerdictSub = document.getElementById('upload-verdict-sub');
  const uploadConfValue = document.getElementById('upload-conf-value');
  const uploadConfBarInner = document.getElementById('upload-conf-bar-inner');
  const btnUploadViewReport = document.getElementById('btn-upload-view-report');
  const btnUploadAgain = document.getElementById('btn-upload-again');

  const pageVideosList = document.getElementById('page-videos-list');
  const pageVideosEmpty = document.getElementById('page-videos-empty');
  const btnScanPage = document.getElementById('btn-scan-page');
  const btnOpenApp = document.getElementById('btn-open-app');

  // Initialize
  function init() {
    setupEventListeners();
    checkBackendStatus();
    loadStoredResults();
  }

  // Setup event listeners
  function setupEventListeners() {
    // Tab switching
    tabButtons.forEach(button => {
      button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    // Screen capture
    if (btnScreenToggle) {
      btnScreenToggle.addEventListener('click', toggleScreenRecording);
    }

    // Duration selector
    if (durationSelector) {
      durationSelector.addEventListener('click', (e) => {
        if (e.target.classList.contains('dg-pill')) {
          selectDuration(e.target);
        }
      });
    }

    // Upload functionality
    if (uploadDropzone) {
      uploadDropzone.addEventListener('click', () => uploadInput?.click());
      uploadDropzone.addEventListener('dragover', handleDragOver);
      uploadDropzone.addEventListener('drop', handleDrop);
      uploadDropzone.addEventListener('dragleave', handleDragLeave);
    }

    if (uploadInput) {
      uploadInput.addEventListener('change', handleFileSelect);
    }

    if (btnUploadAnalyze) {
      btnUploadAnalyze.addEventListener('click', analyzeUpload);
    }

    // Page scan
    if (btnScanPage) {
      btnScanPage.addEventListener('click', scanPageForVideos);
    }

    // Result actions
    if (btnScreenAgain) {
      btnScreenAgain.addEventListener('click', resetScreenCapture);
    }

    if (btnUploadAgain) {
      btnUploadAgain.addEventListener('click', resetUpload);
    }

    if (btnOpenApp) {
      btnOpenApp.addEventListener('click', openFullApp);
    }
  }

  // Tab switching
  function switchTab(tabId) {
    tabButtons.forEach(btn => btn.classList.remove('dg-tab-button--active'));
    tabContents.forEach(content => content.classList.remove('dg-tab-content--active'));

    const activeButton = document.querySelector(`[data-tab="${tabId}"]`);
    const activeContent = document.getElementById(tabId);

    if (activeButton && activeContent) {
      activeButton.classList.add('dg-tab-button--active');
      activeContent.classList.add('dg-tab-content--active');
    }
  }

  // Backend status check
  async function checkBackendStatus() {
    try {
      const status = await DeepGuardAPI.checkStatus(backendUrl);
      updateBackendStatus(true, 'Connected');
    } catch (error) {
      updateBackendStatus(false, 'Offline');
    }
  }

  function updateBackendStatus(isOnline, label) {
    if (statusDotEl) {
      statusDotEl.className = `dg-status-dot dg-status-dot--${isOnline ? 'online' : 'offline'}`;
    }
    if (statusLabelEl) {
      statusLabelEl.textContent = label;
    }
  }

  // Screen capture functionality
  async function toggleScreenRecording() {
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

      if (screenPreview) {
        screenPreview.srcObject = stream;
        screenPreview.style.display = 'block';
      }

      if (screenPlaceholder) {
        screenPlaceholder.style.display = 'none';
      }

      if (recIndicator) {
        recIndicator.hidden = false;
      }

      if (btnScreenToggle) {
        btnScreenToggle.textContent = 'Stop & Analyze';
        btnScreenToggle.classList.remove('dg-button--primary');
        btnScreenToggle.classList.add('dg-button--secondary');
      }

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

      // Auto-stop after duration
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

    if (screenPreview && screenPreview.srcObject) {
      screenPreview.srcObject.getTracks().forEach(track => track.stop());
      screenPreview.style.display = 'none';
    }

    if (screenPlaceholder) {
      screenPlaceholder.style.display = 'flex';
    }

    if (recIndicator) {
      recIndicator.hidden = true;
    }

    if (btnScreenToggle) {
      btnScreenToggle.textContent = 'Start Capture';
      btnScreenToggle.classList.add('dg-button--primary');
      btnScreenToggle.classList.remove('dg-button--secondary');
    }

    isRecording = false;
    stopTimer();
  }

  function handleRecordingStop() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    analyzeScreenRecording(blob);
  }

  function startTimer() {
    recordingTimer = setInterval(() => {
      const elapsed = Date.now() - recordingStartTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const displaySeconds = seconds % 60;
      
      if (timerEl) {
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
      }
    }, 100);
  }

  function stopTimer() {
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    if (timerEl) {
      timerEl.textContent = '00:00';
    }
  }

  function selectDuration(pill) {
    document.querySelectorAll('.dg-pill').forEach(p => p.classList.remove('dg-pill--active'));
    pill.classList.add('dg-pill--active');
    recordingDuration = parseInt(pill.dataset.seconds) * 1000;
  }

  // Analyze screen recording
  async function analyzeScreenRecording(blob) {
    try {
      showScreenResult('Analyzing...', 'Processing your recording...', 0);
      
      const result = await DeepGuardAPI.analyzeScreen(backendUrl, blob);
      
      const verdict = result.verdict.toUpperCase();
      const confidence = result.confidence;
      
      showScreenResult(verdict, `Video analyzed successfully`, confidence);
      saveResult('screen', { verdict, confidence, timestamp: Date.now() });
      
    } catch (error) {
      console.error('Error analyzing screen:', error);
      showScreenResult('ERROR', 'Analysis failed', 0);
    }
  }

  function showScreenResult(verdict, subtitle, confidence) {
    if (screenResultCard) {
      screenResultCard.hidden = false;
    }

    if (screenVerdictLabel) {
      screenVerdictLabel.textContent = verdict;
    }

    if (screenVerdictSub) {
      screenVerdictSub.textContent = subtitle;
    }

    if (screenConfValue) {
      animateConfidence(screenConfValue, confidence);
    }

    if (screenConfBarInner) {
      screenConfBarInner.style.width = `${confidence}%`;
    }

    if (screenVerdictBanner) {
      screenVerdictBanner.className = `dg-verdict-banner dg-verdict-banner--${verdict.toLowerCase()}`;
    }
  }

  // Upload functionality
  function handleDragOver(e) {
    e.preventDefault();
    uploadDropzone.classList.add('dg-dropzone-hover');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    uploadDropzone.classList.remove('dg-dropzone-hover');
  }

  function handleDrop(e) {
    e.preventDefault();
    uploadDropzone.classList.remove('dg-dropzone-hover');
    
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

    if (uploadFileLabel) {
      uploadFileLabel.textContent = file.name;
    }

    if (btnUploadAnalyze) {
      btnUploadAnalyze.disabled = false;
    }
  }

  async function analyzeUpload() {
    const file = uploadInput.files[0];
    if (!file) {
      showError('Please select a video file');
      return;
    }

    try {
      showUploadProgress('Uploading...', 0);
      
      const sequenceLength = parseInt(modelSelect.value);
      const result = await DeepGuardAPI.analyzeVideo(backendUrl, file, sequenceLength);
      
      const verdict = result.verdict.toUpperCase();
      const confidence = result.confidence;
      
      showUploadResult(verdict, 'Video analyzed successfully', confidence);
      saveResult('upload', { verdict, confidence, timestamp: Date.now() });
      
    } catch (error) {
      console.error('Error analyzing upload:', error);
      showUploadResult('ERROR', 'Analysis failed', 0);
    } finally {
      hideUploadProgress();
    }
  }

  function showUploadProgress(label, percent) {
    if (uploadProgressShell) {
      uploadProgressShell.hidden = false;
    }
    if (uploadProgressLabel) {
      uploadProgressLabel.textContent = label;
    }
    if (uploadProgressPercent) {
      uploadProgressPercent.textContent = `${percent}%`;
    }
    if (uploadProgressInner) {
      uploadProgressInner.style.width = `${percent}%`;
    }
  }

  function hideUploadProgress() {
    if (uploadProgressShell) {
      uploadProgressShell.hidden = true;
    }
  }

  function showUploadResult(verdict, subtitle, confidence) {
    if (uploadResultCard) {
      uploadResultCard.hidden = false;
    }

    if (uploadVerdictLabel) {
      uploadVerdictLabel.textContent = verdict;
    }

    if (uploadVerdictSub) {
      uploadVerdictSub.textContent = subtitle;
    }

    if (uploadConfValue) {
      animateConfidence(uploadConfValue, confidence);
    }

    if (uploadConfBarInner) {
      uploadConfBarInner.style.width = `${confidence}%`;
    }

    if (uploadVerdictBanner) {
      uploadVerdictBanner.className = `dg-verdict-banner dg-verdict-banner--${verdict.toLowerCase()}`;
    }
  }

  // Page scan functionality
  async function scanPageForVideos() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: findVideosOnPage
      });

      const videos = results[0]?.result || [];
      displayPageVideos(videos);
      
    } catch (error) {
      console.error('Error scanning page:', error);
      showError('Failed to scan page for videos');
    }
  }

  function displayPageVideos(videos) {
    if (!pageVideosList) return;

    if (videos.length === 0) {
      pageVideosEmpty.style.display = 'block';
      return;
    }

    pageVideosEmpty.style.display = 'none';
    
    const videoCards = videos.map(video => `
      <div class="dg-page-video-card">
        <div class="dg-page-thumb">🎥</div>
        <div class="dg-page-video-meta">
          <div class="dg-page-video-url">${video.url}</div>
        </div>
        <div class="dg-page-video-actions">
          <button class="dg-button dg-button--primary dg-button--sm" onclick="analyzePageVideo('${video.url}')">
            Analyze
          </button>
        </div>
      </div>
    `).join('');

    pageVideosList.innerHTML = videoCards;
  }

  // Utility functions
  function animateConfidence(element, targetValue) {
    const startValue = 0;
    const duration = 800;
    const startTime = Date.now();

    function update() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentValue = startValue + (targetValue - startValue) * easeOutCubic(progress);
      
      element.textContent = `${Math.round(currentValue)}%`;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    update();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function saveResult(type, data) {
    analysisResults.unshift({ type, ...data });
    if (analysisResults.length > 10) {
      analysisResults = analysisResults.slice(0, 10);
    }
    
    chrome.storage.local.set({ 
      deepguardResults: analysisResults,
      lastAnalysis: Date.now()
    });
  }

  async function loadStoredResults() {
    try {
      const data = await chrome.storage.local.get(['deepguardResults', 'lastAnalysis']);
      analysisResults = data.deepguardResults || [];
    } catch (error) {
      console.error('Error loading stored results:', error);
    }
  }

  function resetScreenCapture() {
    if (screenResultCard) {
      screenResultCard.hidden = true;
    }
    if (screenVerdictBanner) {
      screenVerdictBanner.className = 'dg-verdict-banner dg-verdict-banner--idle';
    }
  }

  function resetUpload() {
    if (uploadResultCard) {
      uploadResultCard.hidden = true;
    }
    if (uploadVerdictBanner) {
      uploadVerdictBanner.className = 'dg-verdict-banner dg-verdict-banner--idle';
    }
    if (uploadInput) {
      uploadInput.value = '';
    }
    if (uploadFileLabel) {
      uploadFileLabel.textContent = '';
    }
  }

  function openFullApp() {
    chrome.tabs.create({ url: backendUrl });
  }

  function showError(message) {
    // Simple error display - could be enhanced with toast notifications
    console.error(message);
    alert(message);
  }

  // Function to be injected into pages for video detection
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
      if (src && (src.includes('youtube.com') || src.includes('vimeo.com') || src.includes('dailymotion.com'))) {
        videos.push({
          url: src,
          type: 'iframe',
          index
        });
      }
    });

    return videos;
  }

  // Make the page video analysis function global
  window.analyzePageVideo = async function(videoUrl) {
    try {
      // This would need to be implemented to extract video content and analyze
      // For now, just show a message
      alert(`Analyzing video: ${videoUrl}`);
    } catch (error) {
      console.error('Error analyzing page video:', error);
    }
  };

  // Initialize the popup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
