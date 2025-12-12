import { describe, it, expect, beforeEach } from 'vitest';
import { replaceSelection, insertAtPosition } from '../../utils/audioUtils';

describe('Audio Buffer Manipulation', () => {
  let audioContext;

  beforeEach(() => {
    audioContext = new AudioContext();
  });

  describe('replaceSelection', () => {
    it('should replace selection with clipboard content in a single-channel buffer', () => {
      // Create source buffer with 10 samples
      const sourceBuffer = audioContext.createBuffer(1, 10, 44100);
      const sourceData = sourceBuffer.getChannelData(0);
      for (let i = 0; i < 10; i++) {
        sourceData[i] = i * 0.1; // [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
      }

      // Create clipboard buffer with 3 samples
      const clipboardBuffer = audioContext.createBuffer(1, 3, 44100);
      const clipboardData = clipboardBuffer.getChannelData(0);
      clipboardData[0] = 0.99;
      clipboardData[1] = 0.98;
      clipboardData[2] = 0.97;

      // Replace samples 2-5 (selection of 3 samples) with clipboard
      const result = replaceSelection(sourceBuffer, clipboardBuffer, 2, 5, audioContext);

      // Expected: [0, 0.1, 0.99, 0.98, 0.97, 0.5, 0.6, 0.7, 0.8, 0.9]
      // Length should be 10 - 3 + 3 = 10
      expect(result.length).toBe(10);
      
      const resultData = result.getChannelData(0);
      expect(resultData[0]).toBeCloseTo(0.0, 5);
      expect(resultData[1]).toBeCloseTo(0.1, 5);
      expect(resultData[2]).toBeCloseTo(0.99, 5);
      expect(resultData[3]).toBeCloseTo(0.98, 5);
      expect(resultData[4]).toBeCloseTo(0.97, 5);
      expect(resultData[5]).toBeCloseTo(0.5, 5);
      expect(resultData[6]).toBeCloseTo(0.6, 5);
    });

    it('should replace selection with different-length clipboard content', () => {
      // Create source buffer with 10 samples
      const sourceBuffer = audioContext.createBuffer(1, 10, 44100);
      const sourceData = sourceBuffer.getChannelData(0);
      for (let i = 0; i < 10; i++) {
        sourceData[i] = i * 0.1;
      }

      // Create clipboard buffer with 5 samples (longer than selection)
      const clipboardBuffer = audioContext.createBuffer(1, 5, 44100);
      const clipboardData = clipboardBuffer.getChannelData(0);
      for (let i = 0; i < 5; i++) {
        clipboardData[i] = 0.9 - i * 0.05;
      }

      // Replace samples 3-5 (2 samples) with clipboard (5 samples)
      const result = replaceSelection(sourceBuffer, clipboardBuffer, 3, 5, audioContext);

      // Length should be 10 - 2 + 5 = 13
      expect(result.length).toBe(13);
      
      const resultData = result.getChannelData(0);
      // First 3 samples unchanged
      expect(resultData[0]).toBeCloseTo(0.0, 5);
      expect(resultData[1]).toBeCloseTo(0.1, 5);
      expect(resultData[2]).toBeCloseTo(0.2, 5);
      // Next 5 samples from clipboard
      expect(resultData[3]).toBeCloseTo(0.9, 5);
      expect(resultData[4]).toBeCloseTo(0.85, 5);
      expect(resultData[5]).toBeCloseTo(0.8, 5);
      expect(resultData[6]).toBeCloseTo(0.75, 5);
      expect(resultData[7]).toBeCloseTo(0.7, 5);
      // Remaining samples from source
      expect(resultData[8]).toBeCloseTo(0.5, 5);
      expect(resultData[9]).toBeCloseTo(0.6, 5);
    });

    it('should handle stereo buffer with mono clipboard by wrapping channels', () => {
      // Create stereo source buffer
      const sourceBuffer = audioContext.createBuffer(2, 8, 44100);
      const sourceDataL = sourceBuffer.getChannelData(0);
      const sourceDataR = sourceBuffer.getChannelData(1);
      for (let i = 0; i < 8; i++) {
        sourceDataL[i] = i * 0.1;
        sourceDataR[i] = i * 0.1 + 0.5;
      }

      // Create mono clipboard
      const clipboardBuffer = audioContext.createBuffer(1, 2, 44100);
      const clipboardData = clipboardBuffer.getChannelData(0);
      clipboardData[0] = 0.99;
      clipboardData[1] = 0.98;

      // Replace samples 2-4 with clipboard
      const result = replaceSelection(sourceBuffer, clipboardBuffer, 2, 4, audioContext);

      expect(result.length).toBe(8); // 8 - 2 + 2 = 8
      expect(result.numberOfChannels).toBe(2);
      
      const resultDataL = result.getChannelData(0);
      const resultDataR = result.getChannelData(1);
      
      // Both channels should use the same clipboard data (channel wrapping)
      expect(resultDataL[2]).toBeCloseTo(0.99, 5);
      expect(resultDataL[3]).toBeCloseTo(0.98, 5);
      expect(resultDataR[2]).toBeCloseTo(0.99, 5);
      expect(resultDataR[3]).toBeCloseTo(0.98, 5);
    });
  });

  describe('insertAtPosition', () => {
    it('should insert clipboard at cursor position', () => {
      // Create source buffer with 10 samples
      const sourceBuffer = audioContext.createBuffer(1, 10, 44100);
      const sourceData = sourceBuffer.getChannelData(0);
      for (let i = 0; i < 10; i++) {
        sourceData[i] = i * 0.1;
      }

      // Create clipboard buffer with 3 samples
      const clipboardBuffer = audioContext.createBuffer(1, 3, 44100);
      const clipboardData = clipboardBuffer.getChannelData(0);
      clipboardData[0] = 0.99;
      clipboardData[1] = 0.98;
      clipboardData[2] = 0.97;

      // Insert at position 5
      const result = insertAtPosition(sourceBuffer, clipboardBuffer, 5, audioContext);

      // Expected: [0, 0.1, 0.2, 0.3, 0.4, 0.99, 0.98, 0.97, 0.5, 0.6, 0.7, 0.8, 0.9]
      // Length should be 10 + 3 = 13
      expect(result.length).toBe(13);
      
      const resultData = result.getChannelData(0);
      // Before insertion
      expect(resultData[0]).toBeCloseTo(0.0, 5);
      expect(resultData[4]).toBeCloseTo(0.4, 5);
      // Inserted content
      expect(resultData[5]).toBeCloseTo(0.99, 5);
      expect(resultData[6]).toBeCloseTo(0.98, 5);
      expect(resultData[7]).toBeCloseTo(0.97, 5);
      // After insertion
      expect(resultData[8]).toBeCloseTo(0.5, 5);
      expect(resultData[12]).toBeCloseTo(0.9, 5);
    });

    it('should insert clipboard at the beginning', () => {
      // Create source buffer with 5 samples
      const sourceBuffer = audioContext.createBuffer(1, 5, 44100);
      const sourceData = sourceBuffer.getChannelData(0);
      for (let i = 0; i < 5; i++) {
        sourceData[i] = i * 0.2;
      }

      // Create clipboard buffer
      const clipboardBuffer = audioContext.createBuffer(1, 2, 44100);
      const clipboardData = clipboardBuffer.getChannelData(0);
      clipboardData[0] = 0.99;
      clipboardData[1] = 0.98;

      // Insert at position 0
      const result = insertAtPosition(sourceBuffer, clipboardBuffer, 0, audioContext);

      expect(result.length).toBe(7);
      
      const resultData = result.getChannelData(0);
      expect(resultData[0]).toBeCloseTo(0.99, 5);
      expect(resultData[1]).toBeCloseTo(0.98, 5);
      expect(resultData[2]).toBeCloseTo(0.0, 5);
      expect(resultData[3]).toBeCloseTo(0.2, 5);
    });

    it('should insert clipboard at the end', () => {
      // Create source buffer with 5 samples
      const sourceBuffer = audioContext.createBuffer(1, 5, 44100);
      const sourceData = sourceBuffer.getChannelData(0);
      for (let i = 0; i < 5; i++) {
        sourceData[i] = i * 0.2;
      }

      // Create clipboard buffer
      const clipboardBuffer = audioContext.createBuffer(1, 2, 44100);
      const clipboardData = clipboardBuffer.getChannelData(0);
      clipboardData[0] = 0.99;
      clipboardData[1] = 0.98;

      // Insert at end
      const result = insertAtPosition(sourceBuffer, clipboardBuffer, 5, audioContext);

      expect(result.length).toBe(7);
      
      const resultData = result.getChannelData(0);
      expect(resultData[4]).toBeCloseTo(0.8, 5);
      expect(resultData[5]).toBeCloseTo(0.99, 5);
      expect(resultData[6]).toBeCloseTo(0.98, 5);
    });

    it('should handle stereo buffer with mono clipboard by wrapping channels', () => {
      // Create stereo source buffer
      const sourceBuffer = audioContext.createBuffer(2, 5, 44100);
      const sourceDataL = sourceBuffer.getChannelData(0);
      const sourceDataR = sourceBuffer.getChannelData(1);
      for (let i = 0; i < 5; i++) {
        sourceDataL[i] = i * 0.1;
        sourceDataR[i] = i * 0.1 + 0.5;
      }

      // Create mono clipboard
      const clipboardBuffer = audioContext.createBuffer(1, 2, 44100);
      const clipboardData = clipboardBuffer.getChannelData(0);
      clipboardData[0] = 0.99;
      clipboardData[1] = 0.98;

      // Insert at position 2
      const result = insertAtPosition(sourceBuffer, clipboardBuffer, 2, audioContext);

      expect(result.length).toBe(7);
      expect(result.numberOfChannels).toBe(2);
      
      const resultDataL = result.getChannelData(0);
      const resultDataR = result.getChannelData(1);
      
      // Both channels should use the same clipboard data
      expect(resultDataL[2]).toBeCloseTo(0.99, 5);
      expect(resultDataL[3]).toBeCloseTo(0.98, 5);
      expect(resultDataR[2]).toBeCloseTo(0.99, 5);
      expect(resultDataR[3]).toBeCloseTo(0.98, 5);
    });
  });
});
