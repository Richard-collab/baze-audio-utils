import { useState, useRef, useEffect } from 'react';
import {
  Box, Typography, Button, Tooltip, TextField, Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import ErrorIcon from '@mui/icons-material/Error';
import WaveformEditor from './WaveformEditor';

function AudioItem({
  segment,
  segmentIndex,
  voice,
  isCurrentlyPlaying,
  onDelete,
  onUpdate,
  onRegenerate,
  setMessage
}) {
  const [text, setText] = useState(segment.text);
  const [pauseDuration, setPauseDuration] = useState('1.0');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [played, setPlayed] = useState(segment.played || false);
  const [editorOpen, setEditorOpen] = useState(false);
  const audioRef = useRef(null);
  const textAreaRef = useRef(null);

  useEffect(() => {
    setText(segment.text);
  }, [segment.text]);

  // Insert pause mark
  const handleInsertPause = () => {
    if (!textAreaRef.current) return;
    
    let duration = parseFloat(pauseDuration);
    if (isNaN(duration) || duration < 0) duration = 1.0;
    duration = Math.round(duration * 10) / 10;
    setPauseDuration(duration.toFixed(1));

    const durationMs = Math.round(duration * 1000);
    let pauseMark = '';
    if (voice.includes('MinMax')) {
      pauseMark = `<#${duration}#>`;
    } else if (voice.includes('阿里')) {
      pauseMark = `<break time="${durationMs}ms"/>`;
    } else {
      return;
    }

    const startPos = textAreaRef.current.selectionStart;
    const endPos = textAreaRef.current.selectionEnd;
    const textBefore = text.substring(0, startPos);
    const textAfter = text.substring(endPos);
    const newText = textBefore + pauseMark + textAfter;
    setText(newText);

    setTimeout(() => {
      textAreaRef.current.focus();
      const newPos = startPos + pauseMark.length;
      textAreaRef.current.setSelectionRange(newPos, newPos);
    }, 0);

    setMessage({ text: `已插入停顿标记: ${pauseMark}`, type: 'success' });
  };

  // Regenerate audio
  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate(text);
      setPlayed(false);
    } catch {
      // Error handled in parent
    } finally {
      setIsRegenerating(false);
    }
  };

  // Handle audio play
  const handleAudioPlay = () => {
    setPlayed(true);
    onUpdate({ played: true });
  };

  // Handle editor save
  const handleEditorSave = (newBlob) => {
    if (segment.url) {
      URL.revokeObjectURL(segment.url);
    }
    const newUrl = URL.createObjectURL(newBlob);
    onUpdate({
      blob: newBlob,
      url: newUrl
    });
    setEditorOpen(false);
    setMessage({ text: '音频编辑已保存', type: 'success' });
  };

  const hasError = !!segment.error;

  return (
    <>
      <Box
        sx={{
          mb: 2,
          p: 2,
          bgcolor: isCurrentlyPlaying ? 'rgba(255, 165, 0, 0.05)' : 'rgba(255, 255, 255, 0.7)',
          borderRadius: 2,
          borderLeft: '3px solid',
          borderLeftColor: hasError ? 'error.main' : (isCurrentlyPlaying ? '#FF9800' : 'primary.light'),
          transition: 'all 0.3s ease'
        }}
        className="fade-in"
      >
        {/* Controls Row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: played ? 'success.main' : 'grey.400',
                transition: 'all 0.3s ease'
              }}
            />
            <Chip
              icon={<MusicNoteIcon />}
              label={`片段 ${segmentIndex + 1}`}
              color="primary"
              size="small"
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Pause Controls */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TextField
                type="number"
                size="small"
                value={pauseDuration}
                onChange={(e) => setPauseDuration(e.target.value)}
                inputProps={{ step: 0.1, min: 0, max: 10, style: { width: 60, textAlign: 'center' } }}
                sx={{ width: 80 }}
              />
              <Button
                size="small"
                variant="contained"
                color="warning"
                startIcon={<PauseCircleIcon />}
                onClick={handleInsertPause}
              >
                插入停顿
              </Button>
            </Box>
            {/* Edit Button */}
            {!hasError && segment.url && (
              <Tooltip title="编辑波形">
                <Button
                  size="small"
                  variant="contained"
                  color="info"
                  startIcon={<EditIcon />}
                  onClick={() => setEditorOpen(true)}
                >
                  编辑
                </Button>
              </Tooltip>
            )}
            {/* Delete Button */}
            <Button
              size="small"
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={onDelete}
            >
              删除
            </Button>
            {/* Regenerate Button */}
            <Button
              size="small"
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={handleRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? '生成中...' : '重新生成'}
            </Button>
          </Box>
        </Box>

        {/* Text Area */}
        <Box
          sx={{
            p: 1.5,
            mb: 1.5,
            bgcolor: isCurrentlyPlaying ? 'rgba(255, 165, 0, 0.05)' : 'rgba(108, 92, 231, 0.05)',
            borderLeft: '3px solid',
            borderLeftColor: isCurrentlyPlaying ? '#FF9800' : 'primary.main',
            borderRadius: '0 6px 6px 0'
          }}
        >
          <TextField
            inputRef={textAreaRef}
            multiline
            fullWidth
            value={text}
            onChange={(e) => setText(e.target.value)}
            variant="standard"
            InputProps={{
              disableUnderline: true,
              sx: { fontSize: '0.9rem' }
            }}
          />
        </Box>

        {/* Audio Player or Error */}
        {hasError ? (
          <Box sx={{
            p: 1.5,
            bgcolor: 'rgba(232, 67, 147, 0.05)',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: 'error.main'
          }}>
            <ErrorIcon />
            <Typography variant="body2">生成失败: {segment.error}</Typography>
          </Box>
        ) : (
          <audio
            ref={audioRef}
            controls
            src={segment.url}
            onPlay={handleAudioPlay}
            style={{ width: '100%', borderRadius: 10, height: 40 }}
          />
        )}
      </Box>

      {/* Waveform Editor Dialog */}
      {editorOpen && segment.url && (
        <WaveformEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          audioUrl={segment.url}
          audioBlob={segment.blob}
          onSave={handleEditorSave}
        />
      )}
    </>
  );
}

export default AudioItem;
