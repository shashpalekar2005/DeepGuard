// Service worker for DeepGuard extension
// Handles background tasks and API communication

const API_BASE = 'http://127.0.0.1:8000';

// Install handler
if (chrome.runtime) {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      console.log('DeepGuard extension installed');
      // Set default settings
      if (chrome.storage) {
        chrome.storage.local.set({
          backendUrl: API_BASE,
          analysisHistory: []
        });
      }
    } else if (details.reason === 'update') {
      console.log('DeepGuard extension updated');
    }
    
    // Create context menu
    if (chrome.contextMenus) {
      chrome.contextMenus.create({
        id: 'deepguard-analyze',
        title: 'Analyze with DeepGuard',
        contexts: ['video', 'link'],
        documentUrlPatterns: ['http://*/*', 'https://*/*']
      });
    }
  });
}

// Message handler
if (chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'checkBackend':
        checkBackendStatus()
          .then(status => sendResponse({ success: true, status }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'analyzeVideo':
        analyzeVideo(request.data)
          .then(result => sendResponse({ success: true, result }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'analyzeScreen':
        analyzeScreen(request.data)
          .then(result => sendResponse({ success: true, result }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'getSettings':
        if (chrome.storage) {
          chrome.storage.local.get(['backendUrl', 'analysisHistory'], (data) => {
            sendResponse({ success: true, settings: data });
          });
        }
        return true;
        
      case 'updateSettings':
        if (chrome.storage) {
          chrome.storage.local.set(request.settings, () => {
            sendResponse({ success: true });
          });
        }
        return true;
        
      case 'saveAnalysis':
        saveAnalysisToHistory(request.analysis)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
        return false;
    }
  });
}

// Backend status check
async function checkBackendStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/status/`, {
      method: 'GET',
      headers: {
        'X-Requested-With': 'DeepGuard-Extension',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      online: true,
      details: data
    };
  } catch (error) {
    return {
      online: false,
      error: error.message
    };
  }
}

// Video analysis
async function analyzeVideo(data) {
  const { file, sequenceLength = 20 } = data;
  
  if (!file) {
    throw new Error('No file provided');
  }
  
  try {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('sequence_length', sequenceLength.toString());
    
    const response = await fetch(`${API_BASE}/api/analyze-video/`, {
      method: 'POST',
      headers: {
        'X-Requested-With': 'DeepGuard-Extension'
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Save to history
    await saveAnalysisToHistory({
      type: 'upload',
      result,
      timestamp: Date.now(),
      fileName: file.name,
      fileSize: file.size,
      sequenceLength
    });
    
    return result;
  } catch (error) {
    throw new Error(`Video analysis failed: ${error.message}`);
  }
}

// Screen recording analysis
async function analyzeScreen(data) {
  const { blob, sequenceLength = 10 } = data;
  
  if (!blob) {
    throw new Error('No screen recording provided');
  }
  
  try {
    const formData = new FormData();
    formData.append('screen_video', blob, 'screen-recording.webm');
    formData.append('sequence_length', sequenceLength.toString());
    
    const response = await fetch(`${API_BASE}/api/analyze-screen/`, {
      method: 'POST',
      headers: {
        'X-Requested-With': 'DeepGuard-Extension'
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Save to history
    await saveAnalysisToHistory({
      type: 'screen',
      result,
      timestamp: Date.now(),
      sequenceLength
    });
    
    return result;
  } catch (error) {
    throw new Error(`Screen analysis failed: ${error.message}`);
  }
}

// Save analysis to history
async function saveAnalysisToHistory(analysis) {
  try {
    if (!chrome.storage) {
      throw new Error('Chrome storage API not available');
    }
    const data = await chrome.storage.local.get(['analysisHistory']);
    const history = data.analysisHistory || [];
    
    // Add new analysis to beginning of history
    history.unshift(analysis);
    
    // Keep only last 50 analyses
    const trimmedHistory = history.slice(0, 50);
    
    await chrome.storage.local.set({ analysisHistory: trimmedHistory });
  } catch (error) {
    throw new Error(`Failed to save analysis: ${error.message}`);
  }
}

// Context menu click handler (outside onInstalled)
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'deepguard-analyze') {
      try {
        // Get video URL or link URL
        const videoUrl = info.srcUrl || info.linkUrl;
        
        if (!videoUrl) {
          if (chrome.notifications) {
            chrome.notifications.create({
              type: 'basic',
              title: 'DeepGuard',
              message: 'No video URL found'
            });
          }
          return;
        }
        
        // Open popup with video URL pre-filled
        if (chrome.action) {
          chrome.action.openPopup();
        }
        
        // Send message to popup with video URL
        setTimeout(() => {
          if (chrome.runtime) {
            chrome.runtime.sendMessage({
              action: 'analyzeVideoUrl',
              url: videoUrl
            });
          }
        }, 500);
        
      } catch (error) {
        console.error('Context menu error:', error);
      }
    }
  });
}

// Handle frame analysis from content script
if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Service worker received message:', message.action, message);
    
    if (message.action === 'analyzeFrame') {
      console.log('🎯 Processing frame analysis request...');
      
      // Forward frame data to Django backend
      fetch(`${BACKEND_URL}/api/analyze-frame/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frame: message.frameData
        })
      })
      .then(response => response.json())
      .then(result => {
        console.log('✅ Frame analysis result:', result);
        
        // Send result back to content script
        sendResponse({ 
          action: 'frameAnalysisResult',
          result: result 
        });
      })
      .catch(error => {
        console.error('❌ Frame analysis error:', error);
        sendResponse({ 
          action: 'frameAnalysisResult',
          result: { verdict: 'ERROR', confidence: 0 }
        });
      });
      
      return true; // Keep message channel open
    }
    
    // Handle other messages
    sendResponse({ received: true });
  });
}

// Handle keyboard shortcuts
if (chrome.commands) {
  chrome.commands.onCommand.addListener((command) => {
    switch (command) {
      case 'open-popup':
        if (chrome.action) {
          chrome.action.openPopup();
        }
        break;
      case 'quick-scan':
        // Trigger quick scan
        if (chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && chrome.tabs) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'scanVideos' });
            }
          });
        }
        break;
    }
  });
}

// Handle extension icon click - open side panel
if (chrome.action) {
  chrome.action.onClicked.addListener((tab) => {
    if (chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: tab.id });
    }
  });
}

// Network error handling
if (chrome.runtime) {
  chrome.runtime.onSuspend.addListener(() => {
    console.log('DeepGuard service worker suspended');
  });

  chrome.runtime.onStartup.addListener(() => {
    console.log('DeepGuard service worker started');
  });
}
