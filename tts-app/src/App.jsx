import { useState, useRef, useCallback } from 'react';
import {
  Container, Paper, Typography, Box, Grid, FormControl, InputLabel, Select, MenuItem,
  Tabs, Tab, TextField, Button, LinearProgress, Alert,
  CircularProgress
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import BoltIcon from '@mui/icons-material/Bolt';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import AudioGroup from './components/AudioGroup';
import './App.css';

// Buffer to WAV (moved outside component)
function bufferToWave(abuffer, len) {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  const channels = [];
  let i, sample;
  let offset = 0;
  let pos = 0;

  const setUint16 = (data) => { view.setUint16(offset, data, true); offset += 2; };
  const setUint32 = (data) => { view.setUint32(offset, data, true); offset += 4; };

  setUint32(0x46464952);
  setUint32(length + 36);
  setUint32(0x45564157);
  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164);
  setUint32(length);

  for (i = 0; i < abuffer.numberOfChannels; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  while (pos < len) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
    pos++;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// Merge buffers helper (moved outside component)
function mergeBuffers(audioContext, audioBuffers, resolve) {
  let totalLength = 0;
  audioBuffers.forEach(buffer => {
    if (buffer) totalLength += buffer.length;
  });

  const mergedBuffer = audioContext.createBuffer(
    audioBuffers[0] ? audioBuffers[0].numberOfChannels : 1,
    totalLength,
    audioBuffers[0] ? audioBuffers[0].sampleRate : 44100
  );

  let offset = 0;
  for (let i = 0; i < audioBuffers.length; i++) {
    if (audioBuffers[i]) {
      for (let channel = 0; channel < mergedBuffer.numberOfChannels; channel++) {
        const channelData = mergedBuffer.getChannelData(channel);
        const sourceData = audioBuffers[i].getChannelData(
          channel < audioBuffers[i].numberOfChannels ? channel : 0
        );
        channelData.set(sourceData, offset);
      }
      offset += audioBuffers[i].length;
    }
  }
  const wavBlob = bufferToWave(mergedBuffer, mergedBuffer.length);
  resolve(wavBlob);
}

const theme = createTheme({
  palette: {
    primary: {
      main: '#6C5CE7',
      light: '#A29BFE',
      dark: '#5649C0',
    },
    secondary: {
      main: '#00CEC9',
    },
    error: {
      main: '#E84393',
    },
    success: {
      main: '#00B894',
    },
    warning: {
      main: '#FDCB6E',
    },
  },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
});

// Voice options
const voiceOptions = [
  { value: '', label: '请选择...' },
  { value: 'LAX音色-阿里', label: 'LAX音色-阿里' },
  { value: 'LS音色-阿里', label: 'LS音色-阿里' },
  { value: 'YD音色-MinMax', label: 'YD音色-MinMax' },
  { value: 'YD音色1-MinMax', label: 'YD音色1-MinMax' },
  { value: 'YD音色2-MinMax', label: 'YD音色2-MinMax' },
  { value: 'YY音色-MinMax', label: 'YY音色-MinMax' },
  { value: 'XL音色-MinMax', label: 'XL音色-MinMax' },
  { value: 'TT音色-MinMax', label: 'TT音色-MinMax' },
  { value: 'MD音色-MinMax', label: 'MD音色-MinMax' },
  { value: 'LS音色-MinMax', label: 'LS音色-MinMax' },
  { value: 'WW音色-MinMax', label: 'WW音色-MinMax' },
  { value: 'LAX音色-MinMax', label: 'LAX音色-MinMax' },
  { value: 'YD音色1', label: 'YD音色1' },
  { value: 'YD音色2', label: 'YD音色2' },
  { value: 'YY音色', label: 'YY音色' },
  { value: 'XL音色', label: 'XL音色' },
  { value: 'TT音色', label: 'TT音色' },
  { value: 'MD音色', label: 'MD音色' },
  { value: 'LS音色', label: 'LS音色' },
  { value: 'LAX音色', label: 'LAX音色' },
  { value: '清甜桃桃', label: '清甜桃桃' },
  { value: '软萌团子', label: '软萌团子' },
];

// Speed options
const speedOptions = [
  { value: '0.5', label: '0.5 (很慢)' },
  { value: '0.6', label: '0.6' },
  { value: '0.7', label: '0.7' },
  { value: '0.8', label: '0.8' },
  { value: '0.9', label: '0.9' },
  { value: '1.0', label: '1.0 (正常)' },
  { value: '1.1', label: '1.1' },
  { value: '1.2', label: '1.2' },
  { value: '1.3', label: '1.3' },
  { value: '1.4', label: '1.4' },
  { value: '1.5', label: '1.5 (很快)' },
];

// Volume options
const volumeOptions = [
  { value: '0.5', label: '0.5 (较小)' },
  { value: '0.6', label: '0.6' },
  { value: '0.7', label: '0.7' },
  { value: '0.8', label: '0.8' },
  { value: '0.9', label: '0.9' },
  { value: '1.0', label: '1.0 (正常)' },
  { value: '1.1', label: '1.1' },
  { value: '1.2', label: '1.2' },
  { value: '1.3', label: '1.3' },
  { value: '1.4', label: '1.4' },
  { value: '1.5', label: '1.5 (较大)' },
];

// Pitch options
const pitchOptions = [
  { value: '0.1', label: '0.1 (较低)' },
  { value: '0.2', label: '0.2' },
  { value: '0.3', label: '0.3' },
  { value: '0.4', label: '0.4' },
  { value: '0.5', label: '0.5' },
  { value: '0.6', label: '0.6' },
  { value: '0.7', label: '0.7' },
  { value: '0.8', label: '0.8' },
  { value: '0.9', label: '0.9' },
  { value: '1.0', label: '1.0 (正常)' },
  { value: '1.1', label: '1.1' },
  { value: '1.2', label: '1.2' },
  { value: '1.3', label: '1.3' },
  { value: '1.4', label: '1.4' },
  { value: '1.5', label: '1.5' },
  { value: '1.6', label: '1.6' },
  { value: '1.7', label: '1.7' },
  { value: '1.8', label: '1.8' },
  { value: '1.9', label: '1.9' },
  { value: '2.0', label: '2.0 (较高)' },
];

function App() {
  // Form state
  const [voice, setVoice] = useState('');
  const [speed, setSpeed] = useState('1.0');
  const [volume, setVolume] = useState('1.0');
  const [pitch, setPitch] = useState('1.0');
  const [splitOption, setSplitOption] = useState('no');
  const [tabValue, setTabValue] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [fileName, setFileName] = useState('未选择文件');
  const fileInputRef = useRef(null);
  const excelDataRef = useRef(null);
  
  // Progress state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('准备生成音频...');
  const [message, setMessage] = useState({ text: '', type: '' });
  
  // Audio data
  const [audioGroups, setAudioGroups] = useState([]);
  const mergedAudiosRef = useRef({});

  // Split text into sentences
  const splitTextIntoSentences = useCallback((text) => {
    const sentences = text.split(/([。？])/);
    const result = [];
    let currentSentence = '';
    
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].trim() === '') continue;
      currentSentence += sentences[i];
      if (sentences[i] === '。' || sentences[i] === '？') {
        result.push(currentSentence.trim());
        currentSentence = '';
      }
    }
    if (currentSentence.trim() !== '') {
      result.push(currentSentence.trim());
    }
    return result.filter(sentence => sentence.length > 0);
  }, []);

  // Parse Excel file
  const parseExcelFile = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          if (jsonData.length === 0) {
            reject(new Error('Excel文件中没有数据'));
            return;
          }
          
          const firstRow = jsonData[0];
          if (!Object.prototype.hasOwnProperty.call(firstRow, '语料名称') || !Object.prototype.hasOwnProperty.call(firstRow, '文字内容')) {
            reject(new Error('Excel文件表头必须包含"语料名称"和"文字内容"列'));
            return;
          }
          
          const validData = jsonData
            .filter(row => row['语料名称'] && row['文字内容'])
            .map(row => ({
              index: row['语料名称'],
              text: row['文字内容'].toString().trim()
            }))
            .filter(item => item.text !== '');
          
          if (validData.length === 0) {
            reject(new Error('Excel文件中没有有效的文本数据'));
            return;
          }
          resolve(validData);
        } catch (error) {
          reject(new Error('解析Excel文件失败: ' + error.message));
        }
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  // Fetch with retry
  const fetchWithRetry = useCallback(async (url, options, maxRetries = 3, retryDelay = 1000) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `请求失败: ${response.status}`);
        }
        return response;
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= 2;
        }
      }
    }
    throw lastError;
  }, []);

  // Generate single audio
  const generateSingleAudio = useCallback(async (text, voiceVal, speedVal, volumeVal, pitchVal) => {
    const response = await fetchWithRetry('http://192.168.23.43:6789/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        spk_name: voiceVal,
        speed: speedVal,
        volume: volumeVal,
        pitch: pitchVal
      })
    }, 3, 1000);
    return await response.blob();
  }, [fetchWithRetry]);

  // Handle file change
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      try {
        const data = await parseExcelFile(file);
        excelDataRef.current = data;
      } catch (error) {
        setMessage({ text: error.message, type: 'error' });
        excelDataRef.current = null;
      }
    } else {
      setFileName('未选择文件');
      excelDataRef.current = null;
    }
  };

  // Generate audio
  const handleSynthesize = async () => {
    if (!voice) {
      alert('请选择音色');
      setMessage({ text: '请选择音色', type: 'error' });
      return;
    }

    let data = [];
    if (tabValue === 1) { // Text tab
      const text = textInput.trim();
      if (!text) {
        setMessage({ text: '请输入文本', type: 'error' });
        return;
      }
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length === 0) {
        setMessage({ text: '没有有效的文本行', type: 'error' });
        return;
      }
      data = lines.map((line, index) => ({ index: index + 1, text: line }));
    } else { // Excel tab
      if (!excelDataRef.current) {
        setMessage({ text: '请选择Excel文件', type: 'error' });
        return;
      }
      data = excelDataRef.current;
    }

    if (data.length === 0) {
      setMessage({ text: '没有有效的文本数据', type: 'error' });
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setStatus('准备生成音频...');
    setMessage({ text: '', type: '' });
    setAudioGroups([]);
    mergedAudiosRef.current = {};

    const shouldSplit = splitOption === 'yes';
    let totalSegments = 0;
    data.forEach(item => {
      const segments = shouldSplit ? splitTextIntoSentences(item.text) : [item.text];
      totalSegments += segments.length;
    });

    let processedSegments = 0;
    const newAudioGroups = [];

    try {
      for (let groupIndex = 0; groupIndex < data.length; groupIndex++) {
        const item = data[groupIndex];
        const segments = shouldSplit ? splitTextIntoSentences(item.text) : [item.text];
        
        const audioGroup = {
          index: item.index,
          text: item.text,
          segments: []
        };

        for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
          const segmentText = segments[segmentIndex];
          setStatus(`正在生成第 ${processedSegments + 1} 个音频片段 (共 ${totalSegments} 个)...`);
          const percent = Math.round((processedSegments / totalSegments) * 100);
          setProgress(percent);

          try {
            const blob = await generateSingleAudio(segmentText, voice, speed, volume, pitch);
            const audioUrl = URL.createObjectURL(blob);
            audioGroup.segments.push({
              text: segmentText,
              blob,
              url: audioUrl,
              played: false
            });
          } catch (error) {
            audioGroup.segments.push({
              text: segmentText,
              error: error.message
            });
          }
          processedSegments++;
        }
        newAudioGroups.push(audioGroup);
        setAudioGroups([...newAudioGroups]);
      }

      setProgress(100);
      setStatus(`音频生成完成! 共生成 ${totalSegments} 个音频片段`);
      setMessage({ text: '所有音频生成完成！', type: 'success' });
    } catch (error) {
      setMessage({ text: `错误: ${error.message}`, type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  // Merge audio segments
  const mergeAudioSegments = useCallback(async (audioSegments) => {
    return new Promise((resolve) => {
      const audioContext = new AudioContext({ sampleRate: 8000 });
      const audioBuffers = [];
      let buffersLoaded = 0;

      audioSegments.forEach((segment, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          audioContext.decodeAudioData(e.target.result, (buffer) => {
            audioBuffers[index] = buffer;
            buffersLoaded++;
            if (buffersLoaded === audioSegments.length) {
              mergeBuffers(audioContext, audioBuffers, resolve);
            }
          }, () => {
            buffersLoaded++;
            if (buffersLoaded === audioSegments.length) {
              mergeBuffers(audioContext, audioBuffers, resolve);
            }
          });
        };
        reader.readAsArrayBuffer(segment.blob);
      });
    });
  }, []);

  // Download all
  const handleDownloadAll = async () => {
    if (audioGroups.length === 0) {
      alert('没有可下载的音频文件');
      return;
    }

    setIsDownloading(true);
    setMessage({ text: '正在打包音频文件...', type: '' });

    try {
      const zip = new JSZip();
      
      for (let groupIndex = 0; groupIndex < audioGroups.length; groupIndex++) {
        if (!mergedAudiosRef.current[groupIndex]) {
          const validSegments = audioGroups[groupIndex].segments.filter(seg => !seg.error);
          if (validSegments.length > 0) {
            const mergedBlob = await mergeAudioSegments(validSegments);
            mergedAudiosRef.current[groupIndex] = { blob: mergedBlob };
          }
        }
        
        if (mergedAudiosRef.current[groupIndex]) {
          const originalAudioFileName = `${audioGroups[groupIndex].index}`;
          const audioFileNameList = originalAudioFileName.split('&');
          audioFileNameList.forEach((audioFileName) => {
            zip.file(`${audioFileName}.wav`, mergedAudiosRef.current[groupIndex].blob);
          });
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "完整音频文件.zip");
      setMessage({ text: '音频文件打包下载完成！', type: 'success' });
    } catch (error) {
      setMessage({ text: `打包失败: ${error.message}`, type: 'error' });
    } finally {
      setIsDownloading(false);
    }
  };

  // Update segment callback
  const handleUpdateSegment = useCallback((groupIndex, segmentIndex, newData) => {
    setAudioGroups(prev => {
      const updated = [...prev];
      if (updated[groupIndex] && updated[groupIndex].segments[segmentIndex]) {
        // Clear old URL if exists
        if (updated[groupIndex].segments[segmentIndex].url && newData.url !== updated[groupIndex].segments[segmentIndex].url) {
          URL.revokeObjectURL(updated[groupIndex].segments[segmentIndex].url);
        }
        updated[groupIndex].segments[segmentIndex] = {
          ...updated[groupIndex].segments[segmentIndex],
          ...newData
        };
        // Clear merged audio
        if (mergedAudiosRef.current[groupIndex]) {
          delete mergedAudiosRef.current[groupIndex];
        }
      }
      return updated;
    });
  }, []);

  // Delete segment callback
  const handleDeleteSegment = useCallback((groupIndex, segmentIndex) => {
    setAudioGroups(prev => {
      const updated = [...prev];
      if (updated[groupIndex] && updated[groupIndex].segments[segmentIndex]) {
        if (updated[groupIndex].segments[segmentIndex].url) {
          URL.revokeObjectURL(updated[groupIndex].segments[segmentIndex].url);
        }
        updated[groupIndex].segments.splice(segmentIndex, 1);
        if (mergedAudiosRef.current[groupIndex]) {
          delete mergedAudiosRef.current[groupIndex];
        }
        if (updated[groupIndex].segments.length === 0) {
          updated.splice(groupIndex, 1);
        }
      }
      return updated;
    });
    setMessage({ text: '音频片段已删除', type: 'success' });
  }, []);

  // Delete group callback
  const handleDeleteGroup = useCallback((groupIndex) => {
    setAudioGroups(prev => {
      const updated = [...prev];
      if (updated[groupIndex]) {
        updated[groupIndex].segments.forEach(seg => {
          if (seg.url) URL.revokeObjectURL(seg.url);
        });
        if (mergedAudiosRef.current[groupIndex]) {
          delete mergedAudiosRef.current[groupIndex];
        }
        updated.splice(groupIndex, 1);
      }
      return updated;
    });
    setMessage({ text: '音频组已删除', type: 'success' });
  }, []);

  // Regenerate segment
  const handleRegenerateSegment = useCallback(async (groupIndex, segmentIndex, newText) => {
    try {
      const blob = await generateSingleAudio(newText, voice, speed, volume, pitch);
      const audioUrl = URL.createObjectURL(blob);
      handleUpdateSegment(groupIndex, segmentIndex, {
        text: newText,
        blob,
        url: audioUrl,
        error: undefined,
        played: false
      });
      setMessage({ text: '音频片段重新生成成功！', type: 'success' });
    } catch (error) {
      setMessage({ text: `重新生成音频失败: ${error.message}`, type: 'error' });
      throw error;
    }
  }, [voice, speed, volume, pitch, generateSingleAudio, handleUpdateSegment]);

  // Generate test audio for testing waveform editor
  const handleGenerateTestAudio = useCallback(() => {
    try {
      // AudioContext is created on user interaction (button click), which satisfies browser requirements
      const audioContext = new AudioContext();
      // Using 8000 Hz to match the TTS server's output sample rate for consistency
      const sampleRate = 8000;
      const duration = 5; // 5 seconds for better loop testing
      const numSamples = sampleRate * duration;
      
      // Create a buffer
      const buffer = audioContext.createBuffer(1, numSamples, sampleRate);
      const channelData = buffer.getChannelData(0);
      
      // Generate audio with distinct sections for easier loop testing
      // Section 1 (0-1s): Low tone (220Hz)
      // Section 2 (1-2s): Medium tone (440Hz) 
      // Section 3 (2-3s): High tone (880Hz)
      // Section 4 (3-4s): Frequency sweep from 220Hz to 880Hz
      // Section 5 (4-5s): Chord (220Hz + 440Hz + 660Hz)
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let sample = 0;
        
        if (t < 1) {
          // Section 1: Low tone
          sample = 0.6 * Math.sin(2 * Math.PI * 220 * t);
        } else if (t < 2) {
          // Section 2: Medium tone
          sample = 0.6 * Math.sin(2 * Math.PI * 440 * t);
        } else if (t < 3) {
          // Section 3: High tone
          sample = 0.6 * Math.sin(2 * Math.PI * 880 * t);
        } else if (t < 4) {
          // Section 4: Frequency sweep (glissando effect)
          const sweepProgress = (t - 3); // 0 to 1
          const frequency = 220 + (880 - 220) * sweepProgress;
          sample = 0.6 * Math.sin(2 * Math.PI * frequency * t);
        } else {
          // Section 5: Chord (major chord effect)
          sample = 0.3 * Math.sin(2 * Math.PI * 220 * t) + 
                   0.3 * Math.sin(2 * Math.PI * 440 * t) +
                   0.2 * Math.sin(2 * Math.PI * 660 * t);
        }
        
        // Apply envelope to avoid clicks at section boundaries
        const fadeTime = 0.02; // 20ms fade
        const sectionStart = Math.floor(t);
        const timeInSection = t - sectionStart;
        let envelope = 1;
        if (timeInSection < fadeTime) {
          envelope = timeInSection / fadeTime;
        } else if (timeInSection > (1 - fadeTime)) {
          // Fade out at section boundaries (applies to all sections including the last one)
          envelope = (1 - timeInSection) / fadeTime;
        }
        // Apply final fade-out at the very end of the audio
        const timeToEnd = duration - t;
        if (timeToEnd < fadeTime) {
          envelope *= timeToEnd / fadeTime;
        }
        
        channelData[i] = sample * envelope;
      }
      
      // Convert to WAV blob
      const wavBlob = bufferToWave(buffer, buffer.length);
      const audioUrl = URL.createObjectURL(wavBlob);
      
      // Create a test audio group
      const testGroup = {
        index: '测试音频',
        text: '这是一个测试音频，用于测试波形编辑器和循环播放功能。音频包含5个不同音调的段落：低音(0-1秒)、中音(1-2秒)、高音(2-3秒)、滑音(3-4秒)、和弦(4-5秒)',
        segments: [{
          text: '测试音频片段 - 包含不同音调，适合测试循环播放。选择一段区域后点击循环按钮试试！',
          blob: wavBlob,
          url: audioUrl,
          played: false
        }]
      };
      
      setAudioGroups([testGroup]);
      setMessage({ text: '测试音频已生成，请点击编辑按钮测试波形编辑器和循环播放功能', type: 'success' });
    } catch (error) {
      setMessage({ text: `生成测试音频失败: ${error.message}`, type: 'error' });
    }
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Paper 
          elevation={3} 
          sx={{ 
            p: 3, 
            borderRadius: 4,
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: 'linear-gradient(90deg, #6C5CE7, #00CEC9)',
            }
          }}
        >
          <Typography 
            variant="h4" 
            component="h1" 
            align="center" 
            sx={{ 
              mb: 1, 
              fontWeight: 700,
              '&::after': {
                content: '""',
                display: 'block',
                width: '60px',
                height: '3px',
                background: 'linear-gradient(90deg, #6C5CE7, #00CEC9)',
                margin: '12px auto',
                borderRadius: '2px'
              }
            }}
          >
            语音合成
          </Typography>

          <Typography 
            align="center" 
            color="text.secondary" 
            sx={{ mb: 3, maxWidth: '600px', mx: 'auto' }}
          >
            输入文本或上传Excel文件，每行文本可按句号、问号分割成独立的音频片段，打包导出时会自动合并为完整音频
          </Typography>

          {/* Controls Grid */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>音色选择 <span style={{ color: 'red' }}>[请勿选错]</span></InputLabel>
                <Select
                  value={voice}
                  label="音色选择 [请勿选错]"
                  onChange={(e) => setVoice(e.target.value)}
                >
                  {voiceOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value} disabled={opt.value === ''}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>语速调节</InputLabel>
                <Select value={speed} label="语速调节" onChange={(e) => setSpeed(e.target.value)}>
                  {speedOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>音量控制</InputLabel>
                <Select value={volume} label="音量控制" onChange={(e) => setVolume(e.target.value)}>
                  {volumeOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>音调控制</InputLabel>
                <Select value={pitch} label="音调控制" onChange={(e) => setPitch(e.target.value)}>
                  {pitchOptions.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>文本分割</InputLabel>
                <Select value={splitOption} label="文本分割" onChange={(e) => setSplitOption(e.target.value)}>
                  <MenuItem value="yes">是（将按句号/问号分片）</MenuItem>
                  <MenuItem value="no">否（将整段合成）</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} centered>
              <Tab icon={<UploadFileIcon />} iconPosition="start" label="Excel文件批量合成" />
              <Tab icon={<KeyboardIcon />} iconPosition="start" label="输入文本逐行合成" />
            </Tabs>
          </Box>

          {/* Tab Panels */}
          <Box sx={{ mb: 3 }}>
            {tabValue === 0 && (
              <Box sx={{ 
                p: 3, 
                bgcolor: 'rgba(108, 92, 231, 0.03)', 
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'primary.light'
              }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  请上传包含"语料名称"、"文字内容"列的Excel文件，支持xlsx格式
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Button
                    variant="contained"
                    component="label"
                    startIcon={<UploadFileIcon />}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    点此选择xlsx文件
                    <input
                      type="file"
                      hidden
                      accept=".xlsx,.xls"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />
                  </Button>
                  <Box sx={{ 
                    flex: 1, 
                    p: 1.5, 
                    bgcolor: 'white', 
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider'
                  }}>
                    {fileName}
                  </Box>
                </Box>
              </Box>
            )}
            {tabValue === 1 && (
              <Box sx={{ 
                p: 3, 
                bgcolor: 'rgba(108, 92, 231, 0.03)', 
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'primary.light'
              }}>
                <TextField
                  multiline
                  rows={6}
                  fullWidth
                  placeholder={`请输入文本，一行一个文本，每个文本可按句号、问号分割成片段...\n例如：\n这是第一行文本。\n这是第二行文本。`}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                />
              </Box>
            )}
          </Box>

          {/* Buttons */}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 3, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : <BoltIcon />}
              onClick={handleSynthesize}
              disabled={isGenerating}
              className={!isGenerating ? 'pulse-animation' : ''}
              sx={{ 
                borderRadius: '40px', 
                px: 4,
                boxShadow: '0 8px 20px rgba(108, 92, 231, 0.3)'
              }}
            >
              {isGenerating ? '生成中...' : '开始逐个合成音频'}
            </Button>
            <Button
              variant="contained"
              color="secondary"
              size="large"
              startIcon={isDownloading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
              onClick={handleDownloadAll}
              disabled={audioGroups.length === 0 || isDownloading}
              sx={{ 
                borderRadius: '40px', 
                px: 4,
                boxShadow: '0 8px 20px rgba(0, 206, 201, 0.3)'
              }}
            >
              {isDownloading ? '打包中...' : '打包导出所有音频'}
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={handleGenerateTestAudio}
              sx={{ 
                borderRadius: '40px', 
                px: 4
              }}
            >
              生成测试音频
            </Button>
          </Box>

          {/* Progress */}
          <Box sx={{ 
            p: 2, 
            bgcolor: '#F8F9FA', 
            borderRadius: 2, 
            border: '1px solid',
            borderColor: 'divider',
            mb: 2
          }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" fontWeight={600}>{status}</Typography>
              <Typography variant="body2" color="text.secondary">{progress}%</Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={progress} 
              sx={{ 
                height: 8, 
                borderRadius: 4,
                '& .MuiLinearProgress-bar': {
                  background: 'linear-gradient(90deg, #6C5CE7, #00CEC9)'
                }
              }} 
            />
          </Box>

          {/* Message */}
          {message.text && (
            <Alert 
              severity={message.type === 'error' ? 'error' : 'success'} 
              sx={{ mb: 2 }}
              onClose={() => setMessage({ text: '', type: '' })}
            >
              {message.text}
            </Alert>
          )}

          {/* Audio List */}
          <Box>
            {audioGroups.map((group, groupIndex) => (
              <AudioGroup
                key={`group-${groupIndex}`}
                group={group}
                groupIndex={groupIndex}
                voice={voice}
                onDeleteGroup={handleDeleteGroup}
                onDeleteSegment={handleDeleteSegment}
                onUpdateSegment={handleUpdateSegment}
                onRegenerateSegment={handleRegenerateSegment}
                mergeAudioSegments={mergeAudioSegments}
                mergedAudiosRef={mergedAudiosRef}
                setMessage={setMessage}
              />
            ))}
          </Box>
        </Paper>
      </Container>
    </ThemeProvider>
  );
}

export default App;
