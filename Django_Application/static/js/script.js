/* Upload page: file selection, preview, drag-and-drop, submit loading */

(function () {
  var $fileInput = $('#id_upload_video_file');
  var $videoSource = $('#video_source');
  var $videos = $('#videos');
  var $dropZone = $('#drop-zone');
  var $fileInfo = $('#file-info');
  var $fileInfoName = $('#file-info-name');
  var $fileInfoMeta = $('#file-info-meta');
  var $previewWrap = $('#upload-preview-wrap');
  var $submitBtn = $('#videoUpload');
  var $submitText = $submitBtn.find('.upload-submit-text');
  var $submitLoading = $submitBtn.find('.upload-submit-loading');
  var $progressShell = $('#upload-progress-shell');
  var $progressBar = $('#upload-progress-bar');
  var $progressLabel = $('#upload-progress-label');
  var $eta = $('#upload-eta');

  var ESTIMATED_SECONDS = 18;

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  }

  function showFileAndPreview(file) {
    if (!file) return;
    var url = URL.createObjectURL(file);
    $videoSource.attr('src', url);
    $videos[0].load();
    $fileInfoName.text(file.name);
    $fileInfoMeta.text(formatBytes(file.size) + ' · ' + (file.type || 'video'));
    $dropZone.addClass('has-file');
    $previewWrap.addClass('is-visible');
    $videos.css('display', 'block');
  }

  $fileInput.on('change', function () {
    var file = this.files && this.files[0];
    showFileAndPreview(file);
  });

  $('#file-info-change').on('click', function (e) {
    e.preventDefault();
    $fileInput.trigger('click');
  });

  /* Drag and drop */
  $dropZone.on('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).addClass('dragover');
  });
  $dropZone.on('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).removeClass('dragover');
  });
  $dropZone.on('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).removeClass('dragover');
    var files = e.originalEvent.dataTransfer && e.originalEvent.dataTransfer.files;
    if (files && files.length) {
      $fileInput[0].files = files;
      $fileInput.trigger('change');
    }
  });

  function setProgress(pct, label, etaSeconds) {
    $progressShell.attr('aria-hidden', 'false');
    $progressBar.css('width', pct + '%');
    $progressBar.attr('aria-valuenow', pct);
    if (label) {
      $progressLabel.text(label);
    }
    if (typeof etaSeconds === 'number') {
      $eta.text(etaSeconds.toFixed(1) + 's');
    }
  }

  /* Submit: disable button, show loading spinner and progress */
  $('form#video-upload').on('submit', function () {
    $submitBtn.prop('disabled', true);
    $submitText.addClass('d-none');
    $submitLoading.removeClass('d-none');

    var remaining = ESTIMATED_SECONDS;
    setProgress(8, 'Uploading video…', remaining);

    var intervalId = window.setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(intervalId);
        $eta.text('—');
        return;
      }
      var pct = Math.min(90, 8 + (ESTIMATED_SECONDS - remaining) / ESTIMATED_SECONDS * 70);
      setProgress(pct, 'Running deepfake model…', remaining);
    }, 1000);
  });
})();
