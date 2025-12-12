/**
 * Helper functions for audio buffer manipulation operations
 * These functions are extracted to be testable independently of the UI components
 */

/**
 * Replace a selection in an audio buffer with clipboard content
 * @param {AudioBuffer} sourceBuffer - The source audio buffer
 * @param {AudioBuffer} clipboardBuffer - The clipboard buffer to insert
 * @param {number} selectionStartSample - Selection start in samples
 * @param {number} selectionEndSample - Selection end in samples
 * @param {AudioContext} audioContext - AudioContext for creating new buffer
 * @returns {AudioBuffer} New buffer with selection replaced
 */
export function replaceSelection(
  sourceBuffer,
  clipboardBuffer,
  selectionStartSample,
  selectionEndSample,
  audioContext
) {
  const selectionLength = selectionEndSample - selectionStartSample;
  const newLength = sourceBuffer.length - selectionLength + clipboardBuffer.length;
  
  const newBuffer = audioContext.createBuffer(
    sourceBuffer.numberOfChannels,
    newLength,
    sourceBuffer.sampleRate
  );

  for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
    const sourceData = sourceBuffer.getChannelData(channel);
    const clipboardData = clipboardBuffer.getChannelData(channel % clipboardBuffer.numberOfChannels);
    const newData = newBuffer.getChannelData(channel);

    // Copy before selection
    for (let i = 0; i < selectionStartSample; i++) {
      newData[i] = sourceData[i];
    }

    // Insert clipboard content
    for (let i = 0; i < clipboardBuffer.length; i++) {
      newData[selectionStartSample + i] = clipboardData[i];
    }

    // Copy after selection
    for (let i = selectionEndSample; i < sourceBuffer.length; i++) {
      newData[i - selectionLength + clipboardBuffer.length] = sourceData[i];
    }
  }

  return newBuffer;
}

/**
 * Insert clipboard content at a specific position in an audio buffer
 * @param {AudioBuffer} sourceBuffer - The source audio buffer
 * @param {AudioBuffer} clipboardBuffer - The clipboard buffer to insert
 * @param {number} insertPositionSample - Insert position in samples
 * @param {AudioContext} audioContext - AudioContext for creating new buffer
 * @returns {AudioBuffer} New buffer with clipboard inserted
 */
export function insertAtPosition(
  sourceBuffer,
  clipboardBuffer,
  insertPositionSample,
  audioContext
) {
  const newLength = sourceBuffer.length + clipboardBuffer.length;
  
  const newBuffer = audioContext.createBuffer(
    sourceBuffer.numberOfChannels,
    newLength,
    sourceBuffer.sampleRate
  );

  for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
    const sourceData = sourceBuffer.getChannelData(channel);
    const clipboardData = clipboardBuffer.getChannelData(channel % clipboardBuffer.numberOfChannels);
    const newData = newBuffer.getChannelData(channel);

    // Copy before insertion point
    for (let i = 0; i < insertPositionSample; i++) {
      newData[i] = sourceData[i];
    }

    // Insert clipboard
    for (let i = 0; i < clipboardBuffer.length; i++) {
      newData[insertPositionSample + i] = clipboardData[i];
    }

    // Copy after insertion point
    for (let i = insertPositionSample; i < sourceBuffer.length; i++) {
      newData[i + clipboardBuffer.length] = sourceData[i];
    }
  }

  return newBuffer;
}
