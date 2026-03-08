(function() {
  'use strict';
  
  const BACKEND = 'http://127.0.0.1:8000';
  const PREFIX = 'dg-';
  
  // ── 1. INJECT STYLES ──────────────────────────
  function injectStyles() {
    if (document.getElementById('dg-styles')) return;
    const style = document.createElement('style');
    style.id = 'dg-styles';
    style.textContent = `
      .dg-btn {
        position: absolute !important;
        top: 10px !important;
        right: 10px !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 6px 12px !important;
        background: rgba(10,10,20,0.92) !important;
        border: 1px solid rgba(99,102,241,0.6) !important;
        border-radius: 100px !important;
        cursor: pointer !important;
        font-family: Inter, sans-serif !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        color: #f0f6fc !important;
        backdrop-filter: blur(8px) !important;
        transition: all 0.15s ease !important;
        pointer-events: all !important;
        text-decoration: none !important;
        box-shadow: 0 2px 12px rgba(0,0,0,0.5) !important;
      }
      .dg-btn:hover {
        background: rgba(99,102,241,0.2) !important;
        border-color: rgba(99,102,241,0.9) !important;
      }
      .dg-badge {
        position: absolute !important;
        top: 10px !important;
        right: 10px !important;
        z-index: 2147483647 !important;
        padding: 5px 12px !important;
        border-radius: 100px !important;
        font-family: Inter, sans-serif !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        backdrop-filter: blur(8px) !important;
        pointer-events: none !important;
        animation: dg-fadein 0.2s ease !important;
      }
      .dg-badge-fake {
        background: rgba(239,68,68,0.2) !important;
        border: 1px solid rgba(239,68,68,0.6) !important;
        color: #ef4444 !important;
      }
      .dg-badge-real {
        background: rgba(34,197,94,0.2) !important;
        border: 1px solid rgba(34,197,94,0.6) !important;
        color: #22c55e !important;
      }
      .dg-badge-loading {
        background: rgba(99,102,241,0.2) !important;
        border: 1px solid rgba(99,102,241,0.6) !important;
        color: #a5b4fc !important;
      }
      @keyframes dg-fadein {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      /* FLOATING WIDGET */
      #dg-widget {
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        z-index: 2147483647 !important;
        width: 52px !important;
        height: 52px !important;
        background: rgba(10,10,20,0.95) !important;
        border: 1px solid rgba(99,102,241,0.4) !important;
        border-radius: 50% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        backdrop-filter: blur(12px) !important;
        box-shadow: 0 4px 20px rgba(99,102,241,0.4) !important;
        transition: all 0.2s ease !important;
        font-family: Inter, sans-serif !important;
      }
      #dg-widget:hover {
        border-color: rgba(99,102,241,0.8) !important;
        box-shadow: 0 4px 24px rgba(99,102,241,0.3) !important;
        transform: scale(1.05) !important;
      }
      #dg-widget-panel {
        position: fixed !important;
        bottom: 84px !important;
        right: 24px !important;
        z-index: 2147483646 !important;
        width: 240px !important;
        background: rgba(10,10,20,0.97) !important;
        border: 1px solid rgba(99,102,241,0.3) !important;
        border-radius: 12px !important;
        padding: 16px !important;
        backdrop-filter: blur(12px) !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
        display: none !important;
        font-family: Inter, sans-serif !important;
      }
      #dg-widget-panel.dg-open {
        display: block !important;
      }
      .dg-panel-title {
        font-size: 11px !important;
        font-weight: 600 !important;
        color: #6366f1 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.08em !important;
        margin-bottom: 10px !important;
      }
      .dg-panel-result {
        font-size: 13px !important;
        color: #8b949e !important;
        margin-bottom: 10px !important;
        min-height: 20px !important;
      }
      .dg-panel-btn {
        display: block !important;
        width: 100% !important;
        padding: 7px !important;
        background: rgba(99,102,241,0.15) !important;
        border: 1px solid rgba(99,102,241,0.3) !important;
        border-radius: 6px !important;
        color: #a5b4fc !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        text-align: center !important;
        cursor: pointer !important;
        margin-bottom: 6px !important;
        font-family: Inter, sans-serif !important;
        transition: all 0.15s !important;
      }
      .dg-panel-btn:hover {
        background: rgba(99,102,241,0.25) !important;
      }
      .dg-panel-link {
        display: block !important;
        text-align: center !important;
        font-size: 11px !important;
        color: #484f58 !important;
        text-decoration: none !important;
        margin-top: 4px !important;
      }
      .dg-panel-link:hover { color: #8b949e !important; }
      .dg-wrap {
        position: relative !important;
        display: inline-block !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ── 2. FLOATING WIDGET ────────────────────────
  function createWidget() {
    if (document.getElementById('dg-widget')) return;
    
    const widget = document.createElement('div');
    widget.id = 'dg-widget';
    widget.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" 
        fill="none" stroke="#6366f1" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>`;
    
    const panel = document.createElement('div');
    panel.id = 'dg-widget-panel';
    panel.innerHTML = `
      <div class="dg-panel-title">🛡 DeepGuard Active</div>
      <div class="dg-panel-result" id="dg-last-result">
        No analysis yet
      </div>
      <button class="dg-panel-btn" id="dg-scan-btn">
        Scan Page Videos
      </button>
      <a href="http://127.0.0.1:8000" target="_blank" 
        class="dg-panel-link">Open full app ↗</a>
    `;
    
    document.body.appendChild(widget);
    document.body.appendChild(panel);
  }

  // ── 3. EVENT DELEGATION ───────────────────────
  function setupEventDelegation() {
    document.addEventListener('click', (e) => {
      // Handle scan button
      if (e.target.id === 'dg-scan-btn' || 
          e.target.closest('#dg-scan-btn')) {
        e.stopPropagation();
        processAllVideos();
        
        // Show feedback
        const btn = document.getElementById('dg-scan-btn');
        if (btn) {
          btn.textContent = 'Scanning...';
          setTimeout(() => {
            const videos = document.querySelectorAll('video');
            btn.textContent = `Found ${videos.length} video(s)`;
            setTimeout(() => {
              btn.textContent = 'Scan Page Videos';
            }, 2000);
          }, 500);
        }
      }
      
      // Handle widget toggle
      if (e.target.id === 'dg-widget' || 
          e.target.closest('#dg-widget')) {
        e.stopPropagation();
        const panel = document.getElementById('dg-widget-panel');
        if (panel) panel.classList.toggle('dg-open');
      }
      
      // Close panel on outside click
      if (!e.target.closest('#dg-widget') && 
          !e.target.closest('#dg-widget-panel')) {
        const panel = document.getElementById('dg-widget-panel');
        if (panel) panel.classList.remove('dg-open');
      }
    });
  }

  // ── 4. ANALYZE FRAME ─────────────────────────
  async function analyzeFrame(video) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth, 640) || 640;
      canvas.height = Math.min(video.videoHeight, 360) || 360;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameData = canvas.toDataURL('image/jpeg', 0.7);
      
      const resp = await fetch(
        `${BACKEND}/api/analyze-frame/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame: frameData })
      });
      
      if (!resp.ok) throw new Error('API error');
      return await resp.json();
    } catch(e) {
      console.error('[DeepGuard] Frame analysis failed:', e);
      return null;
    }
  }

  // ── 5. ADD BUTTON TO VIDEO ────────────────────
  function addAnalyzeButton(video) {
    if (video.dataset.dgAttached) return;
    if (video.videoWidth === 0 && video.videoHeight === 0) {
      // Wait for video to load
      video.addEventListener('loadedmetadata', 
        () => addAnalyzeButton(video), {once: true});
      return;
    }
    video.dataset.dgAttached = 'true';
    
    const btn = document.createElement('button');
    btn.className = 'dg-btn';
    btn.id = 'dg-analyze-' + Math.random().toString(36).substr(2,9);
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" 
        fill="none" stroke="#6366f1" stroke-width="2.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg> Analyze`;
    
    // Position fixed relative to video
    function updatePosition() {
      const rect = video.getBoundingClientRect();
      if (rect.width === 0) return;
      btn.style.position = 'fixed';
      btn.style.top = (rect.top + 10) + 'px';
      btn.style.right = (window.innerWidth - rect.right + 10) + 'px';
      btn.style.display = rect.width > 100 ? 'flex' : 'none';
    }
    
    updatePosition();
    document.body.appendChild(btn);
    
    // Update position on scroll/resize
    window.addEventListener('scroll', updatePosition, {passive:true});
    window.addEventListener('resize', updatePosition, {passive:true});
    
    // Update every second for dynamic players
    const posInterval = setInterval(updatePosition, 1000);
    
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.innerHTML = '⟳ Analyzing...';
      btn.style.pointerEvents = 'none';
      
      const result = await analyzeFrame(video);
      
      if (result) {
        const isFake = result.verdict === 'FAKE';
        btn.innerHTML = isFake 
          ? `⚠ FAKE ${result.confidence}%` 
          : `✓ REAL ${result.confidence}%`;
        btn.style.borderColor = isFake 
          ? 'rgba(239,68,68,0.8)' : 'rgba(34,197,94,0.8)';
        btn.style.color = isFake ? '#ef4444' : '#22c55e';
        btn.style.pointerEvents = 'all';
        
        // Update widget
        const lr = document.getElementById('dg-last-result');
        if (lr) {
          lr.style.color = isFake ? '#ef4444' : '#22c55e';
          lr.textContent = isFake 
            ? `⚠ FAKE (${result.confidence}%)` 
            : `✓ REAL (${result.confidence}%)`;
        }
        
        // Reset button after 8s
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="#6366f1" stroke-width="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg> Analyze`;
          btn.style.borderColor = 'rgba(99,102,241,0.6)';
          btn.style.color = '#f0f6fc';
          btn.style.pointerEvents = 'all';
        }, 8000);
      } else {
        btn.innerHTML = '⚠ Failed - retry';
        btn.style.pointerEvents = 'all';
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="#6366f1" stroke-width="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg> Analyze`;
        }, 3000);
      }
    });
  }

  // ── 6. PROCESS ALL VIDEOS ─────────────────────
  function processAllVideos() {
    const videos = document.querySelectorAll('video');
    console.log('[DeepGuard] Found videos:', videos.length);
    videos.forEach(v => addAnalyzeButton(v));
  }

  // ── 7. OBSERVE DOM CHANGES ────────────────────
  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeName === 'VIDEO') {
            addAnalyzeButton(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('video')
              .forEach(v => addAnalyzeButton(v));
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ── 8. INIT ───────────────────────────────────
  function init() {
    injectStyles();
    createWidget();
    setupEventDelegation();
    processAllVideos();
    observeDOM();
    
    // Re-scan after delays for lazy-loaded content
    setTimeout(processAllVideos, 1000);
    setTimeout(processAllVideos, 3000);
    setTimeout(processAllVideos, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
