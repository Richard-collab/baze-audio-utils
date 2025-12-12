import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, IconButton, Slider, Typography, Tooltip, Divider,
  Paper, Stack, TextField
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
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';
import { replaceSelection, insertAtPosition } from '../utils/audioUtils';

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
  const [cursorTime, setCursorTime] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [clipboard, setClipboard] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [loudnessMultiplier, setLoudnessMultiplier] = useState(1.0);
  const [containerReady, setContainerReady] = useState(false);
  const [isWavesurferReady, setIsWavesurferReady] = useState(false);
  const [silenceLength, setSilenceLength] = useState(1);
  const audioContextRef = useRef(null);
  const regionsPluginRef = useRef(null);
  const tempUrlRef = useRef(null); // Track temporary object URLs for cleanup
  const loopingRef = useRef(false); // Track loop state to avoid stale closure
  const suppressNextSeekRef = useRef(false); // Suppress seek event during drag-selection
  const baselineAudioBufferRef = useRef(null); // Store audio buffer before drag starts for preview
  const isDraggingLoudnessRef = useRef(false); // Track if loudness slider is being dragged

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
      // If looping is enabled and there's NO selection, loop the entire audio
      // When there's a selection, the region-out event handles looping instead
      if (loopingRef.current && !selectionRef.current) {
        // Loop from beginning (loop entire audio)
        wavesurfer.setTime(0);
        wavesurfer.play();
      } else {
        // Only set playing to false if not looping
        setIsPlaying(false);
      }
    });

    // Handle seek events as cursor placement
    wavesurfer.on('seeking', (time) => {
      // Ignore seek events that occur during drag-selection
      if (suppressNextSeekRef.current) {
        suppressNextSeekRef.current = false;
        return;
      }
      // User clicked to seek - treat as cursor placement and clear selection
      setCursorTime(time);
      clearSelection();
    });
    
    wavesurfer.on('timeupdate', (time) => {
      setCurrentTime(time);
    });

    // Region events for selection
    regionsPlugin.on('region-created', (region) => {
      // Clear all existing regions except the new one (only allow one region at a time)
      regionsPlugin.getRegions().forEach(existingRegion => {
        if (existingRegion.id !== region.id) {
          existingRegion.remove();
        }
      });
      
      // Clear cursor when a selection is created
      setCursorTime(null);
      suppressNextSeekRef.current = true; // Ignore seek event that may fire during drag
      
      setSelection({
        start: region.start,
        end: region.end,
        region: region
      });
    });

    regionsPlugin.on('region-updated', (region) => {
      setSelection({
        start: region.start,
        end: region.end,
        region: region
      });
    });

    // Handle region-out event for loop playback
    // This fires when playback exits a region, allowing reliable loop detection
    regionsPlugin.on('region-out', (region) => {
      if (loopingRef.current) {
        // When looping is enabled and playback exits the region, restart from the beginning of the region
        region.play();
      }
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
      // If looping is enabled and we have a selection, start from selection start
      if (isLooping && selection) {
        wavesurferRef.current.setTime(selection.start);
      }
      wavesurferRef.current.play();
    }
  }, [isPlaying, isLooping, selection]);

  // Toggle loop mode
  const handleToggleLoop = useCallback(() => {
    const newLooping = !isLooping;
    setIsLooping(newLooping);
    
    // When enabling loop with a selection, immediately start playing from selection start using region.play()
    if (newLooping && selection && selection.region && wavesurferRef.current) {
      // Use region.play() for consistent behavior with the region-out handler
      selection.region.play();
    }
  }, [isLooping, selection]);

  // Clear selection - moved before functions that use it
  const clearSelection = useCallback(() => {
    if (regionsPluginRef.current) {
      regionsPluginRef.current.clearRegions();
    }
    setSelection(null);
  }, []);

  // Clear both selection and cursor
  const clearSelectionAndCursor = useCallback(() => {
    clearSelection();
    setCursorTime(null);
  }, [clearSelection]);

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
    clearSelectionAndCursor();
  }, [selection, audioBuffer, handleCopy, updateAudioBuffer, clearSelectionAndCursor]);

  // Paste from clipboard
  const handlePaste = useCallback(() => {
    if (!clipboard || !audioBuffer) return;

    try {
      let newBuffer;
      let pasteStartTime;
      let pasteEndTime;
      
      // Calculate duration of pasted content in seconds
      // Use clipboard's sample rate for accurate duration calculation
      const pasteDuration = clipboard.length / clipboard.sampleRate;
      
      // Delay for waveform reload before creating selection region
      const WAVEFORM_RELOAD_DELAY_MS = 100;

      if (selection) {
        // Replace selection with clipboard content
        const selectionStartSample = Math.floor(selection.start * audioBuffer.sampleRate);
        const selectionEndSample = Math.floor(selection.end * audioBuffer.sampleRate);
        newBuffer = replaceSelection(
          audioBuffer,
          clipboard,
          selectionStartSample,
          selectionEndSample,
          audioContextRef.current
        );
        // Calculate time range of pasted content
        pasteStartTime = selection.start;
        pasteEndTime = pasteStartTime + pasteDuration;
        clearSelectionAndCursor();
      } else if (cursorTime !== null) {
        // Insert at cursor position
        const insertPosition = Math.floor(cursorTime * audioBuffer.sampleRate);
        newBuffer = insertAtPosition(
          audioBuffer,
          clipboard,
          insertPosition,
          audioContextRef.current
        );
        // Calculate time range of pasted content
        pasteStartTime = cursorTime;
        pasteEndTime = pasteStartTime + pasteDuration;
        clearSelectionAndCursor();
      } else {
        // Insert at currentTime
        const insertPosition = Math.floor(currentTime * audioBuffer.sampleRate);
        newBuffer = insertAtPosition(
          audioBuffer,
          clipboard,
          insertPosition,
          audioContextRef.current
        );
        // Calculate time range of pasted content
        pasteStartTime = currentTime;
        pasteEndTime = pasteStartTime + pasteDuration;
      }

      updateAudioBuffer(newBuffer);
      
      // Create a new selection highlighting the pasted content
      // Wait for waveform to reload before creating the region
      setTimeout(() => {
        if (regionsPluginRef.current && pasteStartTime !== undefined && pasteEndTime !== undefined) {
          regionsPluginRef.current.addRegion({
            start: pasteStartTime,
            end: pasteEndTime,
            color: 'rgba(108, 92, 231, 0.3)',
          });
        }
      }, WAVEFORM_RELOAD_DELAY_MS);
    } catch (error) {
      console.error('Failed to paste audio:', error);
    }
  }, [clipboard, audioBuffer, selection, cursorTime, currentTime, updateAudioBuffer, clearSelectionAndCursor]);

  // Insert silence at cursor or current time
  const handleInsertSilence = useCallback(() => {
    if (!audioBuffer || !audioContextRef.current) return;

    try {
      // Create silence buffer
      const silenceBuffer = audioContextRef.current.createBuffer(
        audioBuffer.numberOfChannels,
        Math.floor(audioBuffer.sampleRate * silenceLength),
        audioBuffer.sampleRate
      );
      // Buffer is automatically initialized to silence (zeros)

      // Determine insert position: cursor time > current time
      const insertTime = cursorTime !== null ? cursorTime : currentTime;
      const insertPosition = Math.floor(insertTime * audioBuffer.sampleRate);

      // Insert silence at position
      const newBuffer = insertAtPosition(
        audioBuffer,
        silenceBuffer,
        insertPosition,
        audioContextRef.current
      );

      updateAudioBuffer(newBuffer);
      
      // Update cursor to position after inserted silence for consecutive insertions
      clearSelection();
      setCursorTime(insertTime + silenceLength);
    } catch (error) {
      console.error('Failed to insert silence:', error);
    }
  }, [audioBuffer, silenceLength, cursorTime, currentTime, updateAudioBuffer, clearSelection]);

  // Adjust volume/loudness for selection or entire audio
  const handleVolumeAdjust = useCallback((newVolume, sourceBuffer = null) => {
    const bufferToUse = sourceBuffer || audioBuffer;
    if (!bufferToUse) return;

    const startSample = selection 
      ? Math.floor(selection.start * bufferToUse.sampleRate) 
      : 0;
    const endSample = selection 
      ? Math.floor(selection.end * bufferToUse.sampleRate) 
      : bufferToUse.length;

    const newBuffer = audioContextRef.current.createBuffer(
      bufferToUse.numberOfChannels,
      bufferToUse.length,
      bufferToUse.sampleRate
    );

    for (let channel = 0; channel < bufferToUse.numberOfChannels; channel++) {
      const sourceData = bufferToUse.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);

      for (let i = 0; i < bufferToUse.length; i++) {
        if (i >= startSample && i < endSample) {
          newData[i] = Math.max(-1, Math.min(1, sourceData[i] * newVolume));
        } else {
          newData[i] = sourceData[i];
        }
      }
    }

    updateAudioBuffer(newBuffer);
  }, [audioBuffer, selection, updateAudioBuffer]);

  // Preview volume/loudness change during drag (temporary visualization)
  const previewVolumeAdjust = useCallback((newVolume, baselineBuffer) => {
    if (!baselineBuffer || !wavesurferRef.current) return;

    const startSample = selection 
      ? Math.floor(selection.start * baselineBuffer.sampleRate) 
      : 0;
    const endSample = selection 
      ? Math.floor(selection.end * baselineBuffer.sampleRate) 
      : baselineBuffer.length;

    const previewBuffer = audioContextRef.current.createBuffer(
      baselineBuffer.numberOfChannels,
      baselineBuffer.length,
      baselineBuffer.sampleRate
    );

    for (let channel = 0; channel < baselineBuffer.numberOfChannels; channel++) {
      const sourceData = baselineBuffer.getChannelData(channel);
      const previewData = previewBuffer.getChannelData(channel);

      for (let i = 0; i < baselineBuffer.length; i++) {
        if (i >= startSample && i < endSample) {
          previewData[i] = Math.max(-1, Math.min(1, sourceData[i] * newVolume));
        } else {
          previewData[i] = sourceData[i];
        }
      }
    }

    // Update waveform display with preview (without affecting history)
    const blob = bufferToWaveBlob(previewBuffer);
    const url = createTempUrl(blob);
    wavesurferRef.current.load(url);
  }, [selection, createTempUrl]);

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
            {/* Silence Length Input */}
            <TextField
              label="空白音(秒)"
              type="number"
              value={silenceLength}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value >= 0.1 && value <= 30) {
                  setSilenceLength(value);
                }
              }}
              inputProps={{
                min: 0.1,
                max: 30,
                step: 0.1,
              }}
              size="small"
              sx={{ width: 120 }}
            />

            {/* Loop Toggle */}
            <Tooltip title={isLooping ? "关闭循环播放" : (selection ? "开启循环播放选区" : "开启循环播放整个音频")}>
              <Button
                variant={isLooping ? "contained" : "outlined"}
                startIcon={<LoopIcon />}
                onClick={handleToggleLoop}
                color={isLooping ? "secondary" : "primary"}
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

            {/* Insert Silence */}
            <Tooltip title="插入空白音">
              <Button
                variant="outlined"
                startIcon={<PauseCircleIcon />}
                onClick={handleInsertSilence}
                disabled={!audioBuffer}
              >
                插入空白音
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

          {/* Cursor info */}
          {!selection && cursorTime !== null && (
            <Typography variant="body2" color="secondary" sx={{ mt: 1 }}>
              光标位置: {formatTime(cursorTime)}
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
                响度调整 {selection ? '(选区)' : '(全局)'} - {Math.round(loudnessMultiplier * 100)}%
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Slider
                  value={loudnessMultiplier}
                  onMouseDown={() => {
                    // Store baseline buffer when drag starts
                    if (audioBuffer && !isDraggingLoudnessRef.current) {
                      isDraggingLoudnessRef.current = true;
                      baselineAudioBufferRef.current = audioBuffer;
                    }
                  }}
                  onChange={(e, v) => {
                    // Update slider value and show preview during drag
                    setLoudnessMultiplier(v);
                    // Apply preview based on baseline buffer (before drag started)
                    if (baselineAudioBufferRef.current) {
                      previewVolumeAdjust(v, baselineAudioBufferRef.current);
                    }
                  }}
                  onChangeCommitted={(e, v) => {
                    // Apply volume change permanently when drag ends (mouse released)
                    if (baselineAudioBufferRef.current) {
                      // Apply change to baseline buffer (before drag started)
                      handleVolumeAdjust(v, baselineAudioBufferRef.current);
                      // Clear baseline reference
                      baselineAudioBufferRef.current = null;
                      isDraggingLoudnessRef.current = false;
                    }
                    // Reset to 100% after applying the change
                    setTimeout(() => setLoudnessMultiplier(1.0), 100);
                  }}
                  min={0.1}
                  max={3}
                  step={0.01}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                  sx={{ flex: 1 }}
                />
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
          提示：在波形上拖动可创建选区，单击可放置光标。粘贴时：有选区则替换选区内容，有光标则在光标位置插入，否则在当前播放位置插入。
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
