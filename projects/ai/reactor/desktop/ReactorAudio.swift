import AppKit
import CoreAudio
import Network

let port: UInt16 = 49321
let website = "https://0923katouc.github.io/projects/ai/reactor/"

final class Spectrum {
    let size = 2048
    private var samples = [Float](repeating: 0, count: 2048)
    private var position = 0
    private var previous = [Double](repeating: 0, count: 1024)
    var output: (([Int], Double, Double) -> Void)?

    func add(_ sample: Float, sampleRate: Double) {
        samples[position] = sample.isFinite ? sample : 0
        position += 1
        guard position == size else { return }
        position = 0
        var real = [Double](repeating: 0, count: size)
        var imaginary = real
        var energy = 0.0
        for i in 0..<size {
            let value = Double(samples[i])
            energy += value * value
            let phase = 2 * Double.pi * Double(i) / Double(size)
            real[i] = value * (0.42 - 0.5 * cos(phase) + 0.08 * cos(2 * phase))
        }
        var reversed = 0
        for i in 1..<size {
            var bit = size >> 1
            while reversed & bit != 0 { reversed ^= bit; bit >>= 1 }
            reversed ^= bit
            if i < reversed { real.swapAt(i, reversed) }
        }
        var length = 2
        while length <= size {
            let angle = -2 * Double.pi / Double(length)
            let wr = cos(angle), wi = sin(angle)
            for base in stride(from: 0, to: size, by: length) {
                var ur = 1.0, ui = 0.0
                for j in 0..<(length / 2) {
                    let a = base + j, b = a + length / 2
                    let vr = real[b] * ur - imaginary[b] * ui
                    let vi = real[b] * ui + imaginary[b] * ur
                    real[b] = real[a] - vr; imaginary[b] = imaginary[a] - vi
                    real[a] += vr; imaginary[a] += vi
                    let next = ur * wr - ui * wi
                    ui = ur * wi + ui * wr; ur = next
                }
            }
            length *= 2
        }
        var bins = [Int](repeating: 0, count: size / 2)
        for i in bins.indices {
            let magnitude = hypot(real[i], imaginary[i]) / Double(size)
            previous[i] = 0.75 * previous[i] + 0.25 * magnitude
            let level = 20 * log10(max(previous[i], 0.00000001))
            bins[i] = Int(max(0, min(255, (level + 100) / 70 * 255)))
        }
        output?(bins, sqrt(energy / Double(size)), sampleRate)
    }
}

final class AudioCapture {
    private var tap = AudioObjectID(kAudioObjectUnknown)
    private var device = AudioObjectID(kAudioObjectUnknown)
    private var process: AudioDeviceIOProcID?
    private let queue = DispatchQueue(label: "cmc.reactor.samples", qos: .userInteractive)
    private var spectrum = Spectrum()
    var output: (([Int], Double, Double) -> Void)?

    private func check(_ status: OSStatus, _ action: String) throws {
        if status != noErr { throw NSError(domain: "ReactorAudio", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "\(action)失败（\(status)）。请在系统设置的隐私与安全性中允许本工具录制系统音频。"] ) }
    }

    func start() throws {
        stop()
        spectrum = Spectrum()
        spectrum.output = output
        do {
            // An empty exclusion list includes the output of every application.
            let description = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
            description.name = "声场反应堆 · 整机声音"
            description.uuid = UUID()
            description.isPrivate = true
            description.muteBehavior = .unmuted
            try check(AudioHardwareCreateProcessTap(description, &tap), "接入系统声音")
            var format = AudioStreamBasicDescription()
            var address = AudioObjectPropertyAddress(mSelector: kAudioTapPropertyFormat, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
            var bytes = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
            try check(AudioObjectGetPropertyData(tap, &address, 0, nil, &bytes, &format), "读取声音格式")
            guard format.mBitsPerChannel == 32, format.mFormatFlags & kAudioFormatFlagIsFloat != 0 else {
                throw NSError(domain: "ReactorAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: "系统返回了暂不支持的声音格式。"])
            }
            let configuration: [String: Any] = [
                kAudioAggregateDeviceNameKey: "CMC Reactor Audio",
                kAudioAggregateDeviceUIDKey: UUID().uuidString,
                kAudioAggregateDeviceIsPrivateKey: true,
                kAudioAggregateDeviceTapAutoStartKey: true,
                kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: description.uuid.uuidString, kAudioSubTapDriftCompensationKey: true]],
            ]
            try check(AudioHardwareCreateAggregateDevice(configuration as CFDictionary, &device), "建立声音连接")
            let sampleRate = format.mSampleRate
            try check(AudioDeviceCreateIOProcIDWithBlock(&process, device, queue) { [weak self] _, input, _, _, _ in
                guard let self = self else { return }
                let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
                let valid = buffers.filter { $0.mData != nil && $0.mNumberChannels > 0 }
                guard let count = valid.map({ Int($0.mDataByteSize) / MemoryLayout<Float>.size / Int($0.mNumberChannels) }).min(), count > 0 else { return }
                let channels = valid.reduce(0) { $0 + Int($1.mNumberChannels) }
                for i in 0..<count {
                    var value: Float = 0
                    for buffer in valid {
                        let data = buffer.mData!.assumingMemoryBound(to: Float.self)
                        for channel in 0..<Int(buffer.mNumberChannels) { value += data[i * Int(buffer.mNumberChannels) + channel] }
                    }
                    self.spectrum.add(value / Float(channels), sampleRate: sampleRate)
                }
            }, "读取整机声音")
            try check(AudioDeviceStart(device, process), "开始接收声音")
        } catch { stop(); throw error }
    }

    func stop() {
        if device != kAudioObjectUnknown {
            if let process = process { AudioDeviceStop(device, process); AudioDeviceDestroyIOProcID(device, process) }
            AudioHardwareDestroyAggregateDevice(device)
        }
        process = nil; device = AudioObjectID(kAudioObjectUnknown)
        if tap != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tap) }
        tap = AudioObjectID(kAudioObjectUnknown)
    }
    deinit { stop() }
}

final class Bridge {
    private let lock = NSLock()
    private let control = DispatchQueue(label: "cmc.reactor.control")
    private let audio = AudioCapture()
    private let token = UUID().uuidString + UUID().uuidString
    private var session: String?
    private var lastSeen = Date.distantPast
    private var running = false, starting = false
    private var error = ""
    private var frame: [String: Any] = ["bins": [Int](repeating: 0, count: 1024), "energy": 0.0, "sampleRate": 48000.0, "sequence": 0]
    private var sequence = 0
    private var listener: NWListener?
    private var watchdog: DispatchSourceTimer?
    private let testing: Bool

    init(testing: Bool = false) {
        self.testing = testing
        audio.output = { [weak self] bins, energy, rate in
            guard let self = self else { return }
            self.lock.lock(); defer { self.lock.unlock() }
            self.sequence += 1
            self.frame = ["bins": bins, "energy": energy, "sampleRate": rate, "sequence": self.sequence]
        }
    }

    func startServer() throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        let listener = try NWListener(using: parameters)
        self.listener = listener
        listener.newConnectionHandler = { [weak self] connection in
            connection.start(queue: DispatchQueue.global(qos: .userInitiated))
            self?.receive(connection, accumulated: Data())
        }
        listener.stateUpdateHandler = { state in
            if case .failed(let error) = state { DispatchQueue.main.async { showError("无法启动本机接入：\(error.localizedDescription)") } }
        }
        listener.start(queue: DispatchQueue(label: "cmc.reactor.listener"))
        let timer = DispatchSource.makeTimerSource(queue: control)
        timer.schedule(deadline: .now() + 2, repeating: 2)
        timer.setEventHandler { [weak self] in
            guard let self = self else { return }
            self.lock.lock()
            let expired = Date().timeIntervalSince(self.lastSeen) > 12 ? self.session : nil
            self.lock.unlock()
            if let expired = expired { self.stop(expected: expired) }
        }
        watchdog = timer; timer.resume()
    }

    private func receive(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, complete, error in
            guard let self = self, error == nil else { connection.cancel(); return }
            var request = accumulated; if let data = data { request.append(data) }
            guard request.count <= 8192 else { connection.cancel(); return }
            if let text = String(data: request, encoding: .utf8), text.contains("\r\n\r\n") { self.handle(connection, request: text) }
            else if !complete { self.receive(connection, accumulated: request) }
            else { connection.cancel() }
        }
    }

    private func handle(_ connection: NWConnection, request: String) {
        let lines = request.components(separatedBy: "\r\n")
        let first = (lines.first ?? "").split(separator: " ")
        guard first.count == 3 else { connection.cancel(); return }
        var headers = [String: String]()
        for line in lines.dropFirst() {
            if let separator = line.firstIndex(of: ":") { headers[String(line[..<separator]).lowercased()] = String(line[line.index(after: separator)...]).trimmingCharacters(in: .whitespaces) }
        }
        let origin = headers["origin"] ?? ""
        let host = headers["host"] ?? ""
        let validOrigin = origin == "https://0923katouc.github.io" || (testing && origin == "http://127.0.0.1:8765")
        guard validOrigin, host == "127.0.0.1:\(port)" else { reply(connection, status: 403, body: ["error": "Origin not allowed"], origin: nil); return }
        let method = String(first[0]), path = String(first[1])
        if method == "OPTIONS" { reply(connection, body: [:], origin: origin); return }
        if method == "GET" && path == "/status" {
            reply(connection, body: ["app": "CMC Reactor Audio", "protocol": 1, "token": token], origin: origin); return
        }
        guard headers["x-reactor-token"] == token else { reply(connection, status: 403, body: ["error": "Invalid token"], origin: origin); return }
        if method == "POST" && path == "/start" {
            let id = UUID().uuidString
            lock.lock(); session = id; lastSeen = Date(); starting = true; running = false; error = ""; lock.unlock()
            control.async { [weak self] in
                guard let self = self else { return }
                self.lock.lock(); let current = self.session == id; self.lock.unlock()
                guard current else { return }
                do {
                    if self.testing {
                        let spectrum = Spectrum(); spectrum.output = self.audio.output
                        for i in 0..<8192 { spectrum.add(0.025 * sin(Float(i) * 2 * .pi * 440 / 48000), sampleRate: 48000) }
                    } else { try self.audio.start() }
                    self.lock.lock(); if self.session == id { self.running = true; self.starting = false }; let cancelled = self.session != id; self.lock.unlock()
                    if cancelled { self.audio.stop() }
                } catch {
                    self.lock.lock(); if self.session == id { self.error = error.localizedDescription; self.starting = false; self.running = false }; self.lock.unlock()
                }
            }
            reply(connection, body: ["session": id], origin: origin); return
        }
        lock.lock()
        let authorized = session != nil && headers["x-reactor-session"] == session
        if authorized { lastSeen = Date() }
        var data = frame
        data["running"] = running; data["starting"] = starting; data["error"] = error
        lock.unlock()
        guard authorized else { reply(connection, status: 409, body: ["error": "Connection ended"], origin: origin); return }
        if method == "GET" && path == "/frame" { reply(connection, body: data, origin: origin) }
        else if method == "POST" && path == "/stop" { stop(expected: headers["x-reactor-session"]); reply(connection, body: ["stopped": true], origin: origin) }
        else { reply(connection, status: 404, body: [:], origin: origin) }
    }

    private func reply(_ connection: NWConnection, status: Int = 200, body: [String: Any], origin: String?) {
        let data = (try? JSONSerialization.data(withJSONObject: body)) ?? Data("{}".utf8)
        var head = "HTTP/1.1 \(status) \(status == 200 ? "OK" : "Error")\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: \(data.count)\r\n"
        if let origin = origin { head += "Access-Control-Allow-Origin: \(origin)\r\nVary: Origin\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: X-Reactor-Token, X-Reactor-Session\r\nAccess-Control-Allow-Private-Network: true\r\nAccess-Control-Max-Age: 600\r\n" }
        var response = Data((head + "\r\n").utf8); response.append(data)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    func stop(expected: String? = nil) {
        lock.lock()
        if let expected = expected, session != expected { lock.unlock(); return }
        session = nil; running = false; starting = false
        lock.unlock()
        control.async { [weak self] in
            guard let self = self else { return }
            self.lock.lock(); let stopped = self.session == nil; self.lock.unlock()
            if stopped { self.audio.stop() }
        }
    }
    func shutdown() { stop(); listener?.cancel(); watchdog?.cancel(); control.sync { audio.stop() } }
}

func showError(_ message: String) {
    let alert = NSAlert(); alert.messageText = "声场反应堆接入器"; alert.informativeText = message; alert.runModal()
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    let bridge = Bridge()
    var item: NSStatusItem?
    func applicationDidFinishLaunching(_ notification: Notification) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item?.button?.title = "◈"
        item?.button?.toolTip = "声场反应堆 · 整机声音接入"
        let menu = NSMenu()
        for (title, action) in [("打开声场反应堆", #selector(openPage)), ("停止接收声音", #selector(stopAudio)), ("退出接入器", #selector(quit))] {
            let entry = NSMenuItem(title: title, action: action, keyEquivalent: ""); entry.target = self; menu.addItem(entry)
        }
        item?.menu = menu
        do { try bridge.startServer() } catch { showError(error.localizedDescription) }
    }
    @objc func openPage() { NSWorkspace.shared.open(URL(string: website)!) }
    @objc func stopAudio() { bridge.stop() }
    @objc func quit() { NSApplication.shared.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) { bridge.shutdown() }
}

if CommandLine.arguments.contains("--self-test") {
    let spectrum = Spectrum()
    var peak = 0, energy = 0.0
    spectrum.output = { bins, level, _ in peak = bins.enumerated().max(by: { $0.element < $1.element })!.offset; energy = level }
    for i in 0..<8192 { spectrum.add(0.025 * sin(Float(i) * 2 * .pi * 440 / 48000), sampleRate: 48000) }
    precondition(abs(Double(peak) * 48000 / 2048 - 440) < 25 && energy > 0.01)
    print("PASS: 440 Hz tone analysis, 1024 frequency bins")
} else if CommandLine.arguments.contains("--test-server") {
    let bridge = Bridge(testing: true); try bridge.startServer(); withExtendedLifetime(bridge) { RunLoop.main.run() }
} else {
    let app = NSApplication.shared
    let delegate = AppDelegate(); app.delegate = delegate
    app.setActivationPolicy(.accessory); withExtendedLifetime(delegate) { app.run() }
}
