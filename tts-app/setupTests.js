import '@testing-library/jest-dom';

// Mock AudioContext
class MockAudioContext {
  constructor() {
    this.sampleRate = 44100;
  }

  createBuffer(numberOfChannels, length, sampleRate) {
    const buffer = {
      numberOfChannels,
      length,
      sampleRate,
      duration: length / sampleRate,
      _channelData: [],
      getChannelData(channel) {
        if (!this._channelData[channel]) {
          this._channelData[channel] = new Float32Array(length);
        }
        return this._channelData[channel];
      },
    };
    return buffer;
  }

  async decodeAudioData(arrayBuffer) {
    // Simple mock that returns a buffer with 2 channels and 44100 samples (1 second)
    const buffer = this.createBuffer(2, 44100, 44100);
    return buffer;
  }
}

// Set up global AudioContext mock
global.AudioContext = MockAudioContext;
global.webkitAudioContext = MockAudioContext;

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = () => 'mock-object-url';
global.URL.revokeObjectURL = () => {};

// Mock WaveSurfer
global.WaveSurfer = {
  create: () => ({
    load: () => {},
    destroy: () => {},
    on: () => {},
    play: () => {},
    pause: () => {},
    setVolume: () => {},
    getDuration: () => 10,
    getCurrentTime: () => 0,
    setTime: () => {},
    zoom: () => {},
  }),
};
