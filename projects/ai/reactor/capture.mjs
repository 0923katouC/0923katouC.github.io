// Capture only the sound explicitly shared through the browser's picker.
// The accompanying video track is kept for the capture lifecycle, never rendered.
export const captureOptions = {
  video: { frameRate: 1 },
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    suppressLocalAudioPlayback: false,
  },
  systemAudio: 'include',
  windowAudio: 'system',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
};

export class SystemAudioCapture {
  constructor({ mediaDevices = globalThis.navigator?.mediaDevices, onEnded = () => {} } = {}) {
    this.mediaDevices = mediaDevices;
    this.onEnded = onEnded;
    this.stream = null;
    this.request = 0;
  }

  async start() {
    this.stop();
    const request = this.request;
    if (!this.mediaDevices?.getDisplayMedia) {
      throw Object.assign(new Error('Display audio capture is unavailable'), { name: 'UnsupportedCaptureError' });
    }
    // Keep this call before any await: the picker needs the original button click.
    const stream = await this.mediaDevices.getDisplayMedia(captureOptions);
    if (request !== this.request) {
      stream.getTracks().forEach(track => track.stop());
      return null;
    }
    if (!stream.getAudioTracks().some(track => track.readyState === 'live')) {
      stream.getTracks().forEach(track => track.stop());
      throw Object.assign(new Error('The selected source contains no audio track'), { name: 'MissingAudioError' });
    }
    this.stream = stream;
    const ended = () => {
      if (this.stream !== stream) return;
      this.stop();
      this.onEnded();
    };
    stream.getTracks().forEach(track => track.addEventListener('ended', ended, { once: true }));
    return stream;
  }

  stop() {
    this.request++;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach(track => track.stop());
  }
}

export function captureErrorMessage(error) {
  switch (error?.name) {
    case 'MissingAudioError':
      return '没有收到声音。请重新选择正在播放声音的标签页，并勾选“共享音频”；要接入其他应用，请选择支持共享系统声音的整个屏幕。';
    case 'NotAllowedError':
      return '尚未允许共享。点击“接入电脑声音”可重新选择；也可以使用音频文件。';
    case 'UnsupportedCaptureError':
      return '当前浏览器不能共享电脑声音。请用桌面版 Chrome 或 Edge 打开，或选择音频文件。';
    case 'NotReadableError':
      return '系统暂未允许读取声音。请检查浏览器的屏幕与系统音频录制权限，然后重新接入。';
    case 'InvalidStateError':
      return '请回到此页面，点击“接入电脑声音”重新选择声音来源。';
    default:
      return '这次未能接入声音。请重新选择播放中的标签页，并勾选“共享音频”，或选择音频文件。';
  }
}
