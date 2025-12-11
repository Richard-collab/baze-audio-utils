import { useState, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, IconButton, Tooltip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import DownloadIcon from '@mui/icons-material/Download';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import AudioItem from './AudioItem';

function AudioGroup({
  group,
  groupIndex,
  voice,
  onDeleteGroup,
  onDeleteSegment,
  onUpdateSegment,
  onRegenerateSegment,
  mergeAudioSegments,
  mergedAudiosRef,
  setMessage
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState(-1);
  const [currentAudio, setCurrentAudio] = useState(null);

  const hasValidSegments = group.segments.some(seg => !seg.error);

  // Play merged audio (sequentially)
  const handlePlayGroup = useCallback(async () => {
    if (isPlaying) {
      // Stop playing
      if (currentAudio) {
        currentAudio.pause();
        setCurrentAudio(null);
      }
      setIsPlaying(false);
      setCurrentPlayingIndex(-1);
      return;
    }

    const validSegments = group.segments.filter(seg => !seg.error);
    if (validSegments.length === 0) {
      setMessage({ text: '没有可用的音频片段进行播放', type: 'error' });
      return;
    }

    setIsPlaying(true);

    // Play segments sequentially
    for (let i = 0; i < validSegments.length; i++) {
      if (!isPlaying) break;
      
      setCurrentPlayingIndex(group.segments.findIndex(s => s === validSegments[i]));
      
      try {
        await new Promise((resolve, reject) => {
          const audio = new Audio(validSegments[i].url);
          setCurrentAudio(audio);
          audio.onended = resolve;
          audio.onerror = () => reject(new Error('播放失败'));
          audio.play().catch(reject);
        });
      } catch (error) {
        console.error('播放音频失败:', error);
      }
    }

    setIsPlaying(false);
    setCurrentPlayingIndex(-1);
    setCurrentAudio(null);
  }, [isPlaying, currentAudio, group.segments, setMessage]);

  // Download merged audio
  const handleDownloadGroup = useCallback(async () => {
    const validSegments = group.segments.filter(seg => !seg.error);
    if (validSegments.length === 0) {
      setMessage({ text: '没有可用的音频片段进行合并', type: 'error' });
      return;
    }

    setIsDownloading(true);

    try {
      if (!mergedAudiosRef.current[groupIndex]) {
        const mergedBlob = await mergeAudioSegments(validSegments);
        mergedAudiosRef.current[groupIndex] = { blob: mergedBlob, url: URL.createObjectURL(mergedBlob) };
      }

      const a = document.createElement('a');
      a.href = mergedAudiosRef.current[groupIndex].url;
      a.download = `${group.index}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setMessage({ text: '完整音频下载成功！', type: 'success' });
    } catch (error) {
      setMessage({ text: `合并音频失败: ${error.message}`, type: 'error' });
    } finally {
      setIsDownloading(false);
    }
  }, [group, groupIndex, mergeAudioSegments, mergedAudiosRef, setMessage]);

  return (
    <Paper
      sx={{
        p: 2,
        mb: 2,
        bgcolor: '#F8F9FA',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 12px 35px rgba(108, 92, 231, 0.12)',
          borderColor: 'primary.light'
        }
      }}
      className="slide-in"
    >
      {/* Group Header */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 2,
        pb: 1.5,
        borderBottom: '1px dashed',
        borderColor: 'divider',
        flexWrap: 'wrap',
        gap: 1
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AudioFileIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={600} color="primary">
            语料名称：{group.index}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => {
              if (window.confirm(`确定要删除语料"${group.index}"的所有音频片段吗？`)) {
                onDeleteGroup(groupIndex);
              }
            }}
          >
            删除音频组
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            onClick={handlePlayGroup}
            disabled={!hasValidSegments}
          >
            {isPlaying ? '暂停播放' : '播放完整音频'}
          </Button>
          <Button
            size="small"
            variant="contained"
            color="secondary"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadGroup}
            disabled={!hasValidSegments || isDownloading}
          >
            {isDownloading ? '合并中...' : '下载完整音频'}
          </Button>
        </Box>
      </Box>

      {/* Audio Items */}
      {group.segments.map((segment, segmentIndex) => (
        <AudioItem
          key={`segment-${groupIndex}-${segmentIndex}`}
          segment={segment}
          segmentIndex={segmentIndex}
          groupIndex={groupIndex}
          voice={voice}
          isCurrentlyPlaying={currentPlayingIndex === segmentIndex}
          onDelete={() => {
            if (window.confirm('确定要删除这个音频片段吗？')) {
              onDeleteSegment(groupIndex, segmentIndex);
            }
          }}
          onUpdate={(newData) => onUpdateSegment(groupIndex, segmentIndex, newData)}
          onRegenerate={(newText) => onRegenerateSegment(groupIndex, segmentIndex, newText)}
          setMessage={setMessage}
        />
      ))}
    </Paper>
  );
}

export default AudioGroup;
