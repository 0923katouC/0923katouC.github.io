const address = 'http://127.0.0.1:49321';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export class DesktopAudioInput {
  constructor({ onEnded = () => {}, fetchImpl = (...args) => fetch(...args) } = {}) {
    this.fetch = fetchImpl;
    this.onEnded = onEnded;
    this.bins = new Uint8Array(1024);
    this.energy = 0;
    this.sampleRate = 48000;
    this.epoch = 0;
    this.session = null;
    this.token = null;
    this.controller = null;
  }

  async request(path, { method = 'GET', signal = this.controller?.signal, timeout = 5000, session = this.session, token = this.token, keepalive = false } = {}) {
    const headers = {};
    if (token) headers['X-Reactor-Token'] = token;
    if (session) headers['X-Reactor-Session'] = session;
    const signals = [AbortSignal.timeout(timeout)];
    if (signal) signals.push(signal);
    const response = await this.fetch(address + path, { method, headers, signal: AbortSignal.any(signals), cache: 'no-store', keepalive });
    if (response.status === 409) throw new Error('整机声音连接已结束，或已由另一张反应堆页面接管。');
    if (!response.ok) throw new Error('本机工具暂时无法接入，请退出并重新打开接入器。');
    return response.json();
  }

  async start() {
    this.stop();
    const epoch = this.epoch;
    this.controller = new AbortController();
    try {
      let status;
      try { status = await this.request('/status'); }
      catch { throw new Error('请先打开“声场反应堆接入器”，再点击接入。如果浏览器询问是否允许连接本机，请选择允许。'); }
      if (epoch !== this.epoch) return false;
      if (status.app !== 'CMC Reactor Audio' || status.protocol !== 1 || typeof status.token !== 'string') {
        throw new Error('本机接入器版本不匹配，请更新后重试。');
      }
      this.token = status.token;
      const started = await this.request('/start', { method: 'POST' });
      if (typeof started.session !== 'string') throw new Error('本机工具没有返回有效连接。');
      if (epoch !== this.epoch) {
        this.request('/stop', { method: 'POST', session: started.session, token: status.token, signal: null, keepalive: true }).catch(() => {});
        return false;
      }
      this.session = started.session;
      const deadline = Date.now() + 120000;
      while (epoch === this.epoch) {
        const frame = await this.request('/frame');
        if (epoch !== this.epoch) return false;
        if (frame.error) throw new Error(frame.error);
        if (frame.running) {
          this.applyFrame(frame);
          this.poll(epoch);
          return true;
        }
        if (!frame.starting || Date.now() > deadline) throw new Error('请允许接入器访问系统音频，并在任意应用播放声音，然后重新接入。');
        await delay(100);
      }
      return false;
    } catch (error) {
      if (epoch !== this.epoch) return false;
      this.stop();
      throw error;
    }
  }

  applyFrame(frame) {
    if (!Array.isArray(frame.bins) || frame.bins.length !== 1024 || !frame.bins.every(n => Number.isInteger(n) && n >= 0 && n <= 255) || !Number.isFinite(frame.energy) || frame.energy < 0 || !Number.isFinite(frame.sampleRate) || frame.sampleRate < 8000 || frame.sampleRate > 384000) {
      throw new Error('本机工具返回的声音数据不完整，请重新接入。');
    }
    this.bins.set(frame.bins);
    this.energy = Math.min(frame.energy, 4);
    this.sampleRate = frame.sampleRate;
  }

  async poll(epoch) {
    try {
      while (epoch === this.epoch) {
        await delay(40);
        if (epoch !== this.epoch) return;
        const frame = await this.request('/frame');
        if (epoch !== this.epoch) return;
        if (frame.error) throw new Error(frame.error);
        if (!frame.running) throw new Error('整机声音接收已停止。');
        this.applyFrame(frame);
      }
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.stop();
      this.onEnded(error.message || '本机声音连接已断开，请重新接入。');
    }
  }

  stop() {
    this.epoch++;
    this.controller?.abort();
    this.controller = null;
    const session = this.session, token = this.token;
    this.session = this.token = null;
    this.bins.fill(0); this.energy = 0;
    if (session && token) this.request('/stop', { method: 'POST', session, token, signal: null, keepalive: true }).catch(() => {});
  }
}
