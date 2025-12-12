import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, IconButton, Slider, Typography, Tooltip, Divider,
  Paper, Stack
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import LoopIcon from '@mui/icons-material/Loop';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import CloseIcon from '@mui/icons-material/Close';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';

// Helper function to convert AudioBuffer to WAV Blob (outside component)
function bufferToWaveBlob(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);
  const channels = [];
  let offset = 0;
  let pos = 0;

  const setUint16 = (data) => { view.setUint16(offset, data, true); offset += 2; };
  const setUint32 = (data) => { view.setUint32(offset, data, true); offset += 4; };

  setUint32(0x46464952); // RIFF
  setUint32(length + 36);
  setUint32(0x45564157); // WAVE
  setUint32(0x20746d66); // fmt
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // data
  setUint32(length);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][pos]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// Format time helper (outside component)
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function WaveformEditor({ open, onClose, audioUrl, audioBlob, onSave }) {
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [zoom, setZoom] = useState(50);
  const [volume, setVolume] = useState(1.0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [clipboard, setClipboard] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [loudnessMultiplier, setLoudnessMultiplier] = useState(1.0);
  const [containerReady, setContainerReady] = useState(false);
  const [isWavesurferReady, setIsWavesurferReady] = useState(false);
  const audioContextRef = useRef(null);
  const regionsPluginRef = useRef(null);
  const tempUrlRef = useRef(null); // Track temporary object URLs for cleanup
  const loopingRef = useRef(false); // Track loop state to avoid stale closure

  // Store refs for functions that need to be called from useEffect
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const selectionRef = useRef(selection); // Track selection for loop playback
  
  // Keep refs in sync
  useEffect(() => {
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
  }, [history, historyIndex]);

  // Keep selection ref in sync
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Keep looping ref in sync
  useEffect(() => {
    loopingRef.current = isLooping;
  }, [isLooping]);

  // Cleanup temporary URL on unmount
  useEffect(() => {
    return () => {
      if (tempUrlRef.current) {
        URL.revokeObjectURL(tempUrlRef.current);
      }
    };
  }, []);

  // Ref callback to track when container is ready
  const setWaveformRef = useCallback((node) => {
    waveformRef.current = node;
    if (node) {
      setContainerReady(true);
    } else {
      setContainerReady(false);
    }
  }, []);

  // Helper to create and track object URL
  const createTempUrl = useCallback((blob) => {
    // Revoke previous URL to prevent memory leak
    if (tempUrlRef.current) {
      URL.revokeObjectURL(tempUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    tempUrlRef.current = url;
    return url;
  }, []);

  // Decode audio for editing operations
  const decodeAudioForEditing = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const arrayBufferData = await audioBlob.arrayBuffer();
      const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBufferData);
      setAudioBuffer(decodedBuffer);
      // Initialize history with original
      setHistory([decodedBuffer]);
      setHistoryIndex(0);
    } catch (error) {
      console.error('Failed to decode audio:', error);
    }
  }, [audioBlob]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!open || !containerReady || !waveformRef.current) return;

    // Clean up any existing instance (important for React StrictMode)
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    // Create regions plugin
    const regionsPlugin = RegionsPlugin.create();
    regionsPluginRef.current = regionsPlugin;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#A29BFE',
      progressColor: '#6C5CE7',
      cursorColor: '#E84393',
      barWidth: 2,
      barRadius: 2,
      cursorWidth: 2,
      height: 150,
      barGap: 1,
      minPxPerSec: zoom, // Set initial zoom level
      plugins: [regionsPlugin],
    });

    wavesurferRef.current = wavesurfer;

    // Load audio
    wavesurfer.load(audioUrl);

    // Events
    wavesurfer.on('ready', () => {
      setDuration(wavesurfer.getDuration());
      wavesurfer.setVolume(volume);
      setIsWavesurferReady(true);
      // Note: Initial zoom is set via minPxPerSec option during initialization
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('finish', () => {
      setIsPlaying(false);
      // Note: When using region.play() with region.loop enabled,
      // the regions plugin handles looping automatically.
      // This event is primarily for when the entire audio finishes
      // during normal (non-region) playback.
    });
    
    wavesurfer.on('timeupdate', (time) => {
      setCurrentTime(time);
      // Note: When using region.play() with region.loop enabled, 
      // the regions plugin handles looping automatically.
    });

    // Region events for selection
    regionsPlugin.on('region-created', (region) => {
      // Clear all existing regions except the new one (only allow one region at a time)
      regionsPlugin.getRegions().forEach(existingRegion => {
        if (existingRegion.id !== region.id) {
          existingRegion.remove();
        }
      });
      
      // Set loop property based on current loop state
      region.loop = loopingRef.current;
      
      setSelection({
        start: region.start,
        end: region.end,
        region: region
      });
    });

    regionsPlugin.on('region-updated', (region) => {
      // Maintain loop property when region is updated
      region.loop = loopingRef.current;
      
      setSelection({
        start: region.start,
        end: region.end,
        region: region
      });
    });

    // Handle region click to play the region
    regionsPlugin.on('region-clicked', (region, e) => {
      e.stopPropagation();
      // If already playing, pause first to allow restarting from region start
      if (wavesurfer.isPlaying()) {
        wavesurfer.pause();
      }
      // Play the region - WaveSurfer.js will respect the region's loop property
      region.play();
    });

    // Enable region creation on drag
    regionsPlugin.enableDragSelection({
      color: 'rgba(108, 92, 231, 0.3)',
    });

    return () => {
      setIsWavesurferReady(false);
      wavesurfer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volume and zoom are intentionally omitted as they're handled in separate useEffects
  }, [open, audioUrl, containerReady]); // containerReady ensures DOM is ready

  // Decode audio when dialog opens
  useEffect(() => {
    if (open && audioBlob) {
      decodeAudioForEditing();
    }
  }, [open, audioBlob, decodeAudioForEditing]);

  // Update zoom - only when wavesurfer is ready
  useEffect(() => {
    if (wavesurferRef.current && isWavesurferReady) {
      wavesurferRef.current.zoom(zoom);
    }
  }, [zoom, isWavesurferReady]);

  // Update volume
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(volume);
    }
  }, [volume]);

  // Handle mouse wheel for zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    setZoom(prev => Math.max(10, Math.min(500, prev + delta)));
  }, []);

  // Play/Stop toggle
  const handlePlayStop = useCallback(() => {
    if (!wavesurferRef.current) return;
    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      // If we have a selection, use region play for better loop support
      if (selection && selection.region) {
        // The region.play() method respects the region's loop property
        selection.region.play();
      } else {
        // No selection, play normally from current position
        wavesurferRef.current.play();
      }
    }
  }, [isPlaying, selection]);

  // Toggle loop mode
  const handleToggleLoop = useCallback(() => {
    setIsLooping(prev => {
      const newLoopState = !prev;
      // If we have a selection region, update its loop property
      if (selection && selection.region) {
        selection.region.loop = newLoopState;
      }
      return newLoopState;
    });
  }, [selection]);

  // Clear selection - moved before functions that use it
  const clearSelection = useCallback(() => {
    if (regionsPluginRef.current) {
      regionsPluginRef.current.clearRegions();
    }
    setSelection(null);
  }, []);

  // Update audio buffer and history - moved before functions that use it
  const updateAudioBuffer = useCallback((newBuffer) => {
    setAudioBuffer(newBuffer);
    
    // Update history using refs to get latest values
    setHistory(prevHistory => {
      const newHistory = prevHistory.slice(0, historyIndexRef.current + 1);
      newHistory.push(newBuffer);
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);

    // Update waveform display
    const blob = bufferToWaveBlob(newBuffer);
    const url = createTempUrl(blob);
    wavesurferRef.current.load(url);
  }, [createTempUrl]);

  // Copy selection
  const handleCopy = useCallback(() => {
    if (!selection || !audioBuffer) return;
    
    const startSample = Math.floor(selection.start * audioBuffer.sampleRate);
    const endSample = Math.floor(selection.end * audioBuffer.sampleRate);
    const length = endSample - startSample;
    
    if (length <= 0) return;

    const clipboardBuffer = audioContextRef.current.createBuffer(
      audioBuffer.numberOfChannels,
      length,
      audioBuffer.sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const clipboardData = clipboardBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        clipboardData[i] = sourceData[startSample + i];
      }
    }

    setClipboard(clipboardBuffer);
  }, [selection, audioBuffer]);

  // Cut selection
  const handleCut = useCallback(() => {
    if (!selection || !audioBuffer) return;

    // Copy first
    handleCopy();

    const startSample = Math.floor(selection.start * audioBuffer.sampleRate);
    const endSample = Math.floor(selection.end * audioBuffer.sampleRate);
    const cutLength = endSample - startSample;
    
    if (cutLength <= 0) return;

    const newLength = audioBuffer.length - cutLength;
    const newBuffer = audioContextRef.current.createBuffer(
      audioBuffer.numberOfChannels,
      newLength,
      audioBuffer.sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);
      
      // Copy before selection
      for (let i = 0; i < startSample; i++) {
        newData[i] = sourceData[i];
      }
      // Copy after selection
      for (let i = endSample; i < audioBuffer.length; i++) {
        newData[i - cutLength] = sourceData[i];
      }
    }

    updateAudioBuffer(newBuffer);
    clearSelection();
  }, [selection, audioBuffer, handleCopy, updateAudioBuffer, clearSelection]);

  // Paste from clipboard
  const handlePaste = useCallback(() => {
    if (!clipboard || !audioBuffer) return;

    const insertPosition = selection 
      ? Math.floor(selection.start * audioBuffer.sampleRate)
      : Math.floor(currentTime * audioBuffer.sampleRate);

    const newLength = audioBuffer.length + clipboard.length;
    const newBuffer = audioContextRef.current.createBuffer(
      audioBuffer.numberOfChannels,
      newLength,
      audioBuffer.sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const clipboardData = clipboard.getChannelData(channel % clipboard.numberOfChannels);
      const newData = newBuffer.getChannelData(channel);

      // Copy before insertion point
      for (let i = 0; i < insertPosition; i++) {
        newData[i] = sourceData[i];
      }
      // Insert clipboard
      for (let i = 0; i < clipboard.length; i++) {
        newData[insertPosition + i] = clipboardData[i];
      }
      // Copy after insertion point
      for (let i = insertPosition; i < audioBuffer.length; i++) {
        newData[i + clipboard.length] = sourceData[i];
      }
    }

    updateAudioBuffer(newBuffer);
  }, [clipboard, audioBuffer, selection, currentTime, updateAudioBuffer]);

  // Adjust volume/loudness for selection or entire audio
  const handleVolumeAdjust = useCallback((newVolume) => {
    if (!audioBuffer) return;

    const startSample = selection 
      ? Math.floor(selection.start * audioBuffer.sampleRate) 
      : 0;
    const endSample = selection 
      ? Math.floor(selection.end * audioBuffer.sampleRate) 
      : audioBuffer.length;

    const newBuffer = audioContextRef.current.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);

      for (let i = 0; i < audioBuffer.length; i++) {
        if (i >= startSample && i < endSample) {
          newData[i] = Math.max(-1, Math.min(1, sourceData[i] * newVolume));
        } else {
          newData[i] = sourceData[i];
        }
      }
    }

    updateAudioBuffer(newBuffer);
  }, [audioBuffer, selection, updateAudioBuffer]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      const newIndex = historyIndexRef.current - 1;
      setHistoryIndex(newIndex);
      setAudioBuffer(historyRef.current[newIndex]);
      
      const blob = bufferToWaveBlob(historyRef.current[newIndex]);
      const url = createTempUrl(blob);
      wavesurferRef.current.load(url);
    }
  }, [createTempUrl]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      const newIndex = historyIndexRef.current + 1;
      setHistoryIndex(newIndex);
      setAudioBuffer(historyRef.current[newIndex]);
      
      const blob = bufferToWaveBlob(historyRef.current[newIndex]);
      const url = createTempUrl(blob);
      wavesurferRef.current.load(url);
    }
  }, [createTempUrl]);

  // Save and close
  const handleSave = useCallback(() => {
    if (!audioBuffer) {
      onClose();
      return;
    }
    const blob = bufferToWaveBlob(audioBuffer);
    onSave(blob);
  }, [audioBuffer, onSave, onClose]);

  // Store handler refs for keyboard shortcuts
  const handlersRef = useRef({});
  
  // Update refs in effect to avoid render-time mutation
  useEffect(() => {
    handlersRef.current = {
      handlePlayStop,
      handleCopy,
      handleCut,
      handlePaste,
      handleSave,
      handleUndo,
      handleRedo
    };
  }, [handlePlayStop, handleCopy, handleCut, handlePaste, handleSave, handleUndo, handleRedo]);

  // Keyboard shortcuts (using refs to avoid stale closures)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      // Prevent default for our shortcuts
      if (e.code === 'Space' || 
          (e.ctrlKey && ['KeyC', 'KeyX', 'KeyV', 'KeyS', 'KeyZ', 'KeyY'].includes(e.code))) {
        e.preventDefault();
      }

      if (e.code === 'Space') {
        handlersRef.current.handlePlayStop?.();
      } else if (e.ctrlKey && e.code === 'KeyC') {
        handlersRef.current.handleCopy?.();
      } else if (e.ctrlKey && e.code === 'KeyX') {
        handlersRef.current.handleCut?.();
      } else if (e.ctrlKey && e.code === 'KeyV') {
        handlersRef.current.handlePaste?.();
      } else if (e.ctrlKey && e.code === 'KeyS') {
        handlersRef.current.handleSave?.();
      } else if (e.ctrlKey && e.code === 'KeyZ') {
        handlersRef.current.handleUndo?.();
      } else if (e.ctrlKey && e.code === 'KeyY') {
        handlersRef.current.handleRedo?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '60vh' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">音频波形编辑器</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Toolbar */}
        <Paper sx={{ p: 1, mb: 2, bgcolor: '#F8F9FA' }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" justifyContent="center">
            {/* Loop Toggle */}
            <Tooltip title={isLooping ? "关闭循环播放" : "开启循环播放选区 (需要先选择区域)"}>
              <Button
                variant={isLooping ? "contained" : "outlined"}
                startIcon={<LoopIcon />}
                onClick={handleToggleLoop}
                color={isLooping ? "secondary" : "primary"}
                disabled={!selection}
              >
                {isLooping ? '循环中' : '循环'}
              </Button>
            </Tooltip>

            {/* Play/Stop */}
            <Tooltip title={isPlaying ? "停止 (空格)" : "播放 (空格)"}>
              <Button
                variant="contained"
                startIcon={isPlaying ? <StopIcon /> : <PlayArrowIcon />}
                onClick={handlePlayStop}
                color={isPlaying ? "error" : "primary"}
              >
                {isPlaying ? '停止' : '播放'}
              </Button>
            </Tooltip>

            <Divider orientation="vertical" flexItem />

            {/* Copy */}
            <Tooltip title="复制 (Ctrl+C)">
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopy}
                disabled={!selection}
              >
                复制
              </Button>
            </Tooltip>

            {/* Cut */}
            <Tooltip title="剪切 (Ctrl+X)">
              <Button
                variant="outlined"
                startIcon={<ContentCutIcon />}
                onClick={handleCut}
                disabled={!selection}
              >
                剪切
              </Button>
            </Tooltip>

            {/* Paste */}
            <Tooltip title="粘贴 (Ctrl+V)">
              <Button
                variant="outlined"
                startIcon={<ContentPasteIcon />}
                onClick={handlePaste}
                disabled={!clipboard}
              >
                粘贴
              </Button>
            </Tooltip>

            <Divider orientation="vertical" flexItem />

            {/* Undo */}
            <Tooltip title="撤销 (Ctrl+Z)">
              <Button
                variant="outlined"
                startIcon={<UndoIcon />}
                onClick={handleUndo}
                disabled={historyIndex <= 0}
              >
                撤销
              </Button>
            </Tooltip>

            {/* Redo */}
            <Tooltip title="恢复 (Ctrl+Y)">
              <Button
                variant="outlined"
                startIcon={<RedoIcon />}
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
              >
                恢复
              </Button>
            </Tooltip>

            <Divider orientation="vertical" flexItem />

            {/* Save */}
            <Tooltip title="保存 (Ctrl+S)">
              <Button
                variant="contained"
                color="success"
                startIcon={<SaveIcon />}
                onClick={handleSave}
              >
                保存
              </Button>
            </Tooltip>
          </Stack>
        </Paper>

        {/* Waveform Container */}
        <Paper 
          sx={{ p: 2, mb: 2, bgcolor: '#fff', border: '1px solid', borderColor: 'divider' }}
          onWheel={handleWheel}
        >
          <div ref={setWaveformRef} style={{ width: '100%', minHeight: '150px', overflowX: 'auto' }} />
          
          {/* Time display */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              当前: {formatTime(currentTime)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              总时长: {formatTime(duration)}
            </Typography>
          </Box>

          {/* Selection info */}
          {selection && (
            <Typography variant="body2" color="primary" sx={{ mt: 1 }}>
              选区: {formatTime(selection.start)} - {formatTime(selection.end)} 
              (时长: {formatTime(selection.end - selection.start)})
            </Typography>
          )}
        </Paper>

        {/* Controls */}
        <Paper sx={{ p: 2, bgcolor: '#F8F9FA' }}>
          <Stack spacing={3}>
            {/* Zoom Control */}
            <Box>
              <Typography variant="body2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ZoomInIcon fontSize="small" />
                缩放 (也可使用鼠标滚轮)
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <ZoomOutIcon />
                <Slider
                  value={zoom}
                  onChange={(e, v) => setZoom(v)}
                  min={10}
                  max={500}
                  valueLabelDisplay="auto"
                  sx={{ flex: 1 }}
                />
                <ZoomInIcon />
                <Typography variant="body2" sx={{ minWidth: 60 }}>{zoom}x</Typography>
              </Stack>
            </Box>

            {/* Volume/Loudness Control */}
            <Box>
              <Typography variant="body2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <VolumeUpIcon fontSize="small" />
                响度调整 {selection ? '(选区)' : '(全局)'}
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Slider
                  value={loudnessMultiplier}
                  onChange={(e, v) => setLoudnessMultiplier(v)}
                  min={0.1}
                  max={3}
                  step={0.1}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                  sx={{ flex: 1 }}
                />
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => {
                    handleVolumeAdjust(loudnessMultiplier);
                    setLoudnessMultiplier(1.0);
                  }}
                >
                  应用
                </Button>
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => {
                    handleVolumeAdjust(0.5);
                    setLoudnessMultiplier(1.0);
                  }}
                >
                  -50%
                </Button>
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => {
                    handleVolumeAdjust(1.5);
                    setLoudnessMultiplier(1.0);
                  }}
                >
                  +50%
                </Button>
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => {
                    handleVolumeAdjust(2.0);
                    setLoudnessMultiplier(1.0);
                  }}
                >
                  +100%
                </Button>
              </Stack>
            </Box>

            {/* Playback Volume */}
            <Box>
              <Typography variant="body2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <VolumeUpIcon fontSize="small" />
                播放音量
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Slider
                  value={volume}
                  onChange={(e, v) => setVolume(v)}
                  min={0}
                  max={1}
                  step={0.1}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                  sx={{ flex: 1 }}
                />
                <Typography variant="body2" sx={{ minWidth: 60 }}>{Math.round(volume * 100)}%</Typography>
              </Stack>
            </Box>
          </Stack>
        </Paper>

        {/* Help Text */}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          提示：在波形上拖动可创建选区，使用工具栏按钮或快捷键进行编辑操作。
          循环播放：选择区域后点击循环按钮，播放到选区右边界时会自动从左边界继续播放。
          快捷键：空格(播放/停止)、Ctrl+C(复制)、Ctrl+X(剪切)、Ctrl+V(粘贴)、Ctrl+S(保存)、Ctrl+Z(撤销)、Ctrl+Y(恢复)
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleSave} startIcon={<SaveIcon />}>
          保存并关闭
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default WaveformEditor;
