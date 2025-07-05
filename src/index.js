"use strict";
/**
 * IINA Web Remote Plugin - Main Entry Point
 *
 * This plugin provides remote control functionality via WebSocket server.
 * Uses IINA's built-in WebSocket API to create a local server.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Import IINA API modules
const { console, core, event, mpv, utils, ws } = iina;
// Global state for connection management
let activeConnections = new Set();
let lastStatusBroadcast = 0;
const STATUS_BROADCAST_THROTTLE = 1000; // Max once per second
// Server configuration
let currentPort = 10010;
const FALLBACK_PORTS = [10010, 10011, 10012, 10013, 10014, 10015];
let serverStarted = false;
/**
 * Initialize the plugin
 */
function init() {
    console.log("IINA Web Remote Plugin: Initializing...");
    // Set up WebSocket server
    setupWebSocket();
    // Set up event listeners
    setupEventListeners();
    // Show initialization message
    core.osd("IINA Web Remote Plugin: Loaded");
    console.log("IINA Web Remote Plugin: Initialized successfully");
    // Log device information
    getDeviceName().then(deviceName => {
        console.log(`Device name: ${deviceName}`);
    }).catch(error => {
        console.log(`Failed to get device name: ${error}`);
    });
}
/**
 * Set up WebSocket server for remote control
 */
function setupWebSocket() {
    console.log("Setting up WebSocket server...");
    // Try to start server on available port
    tryStartServer(0);
}
/**
 * Try to start WebSocket server on available port
 */
function tryStartServer(portIndex) {
    if (portIndex >= FALLBACK_PORTS.length) {
        console.log("Failed to start WebSocket server: no available ports");
        core.osd("Web Remote: No available ports");
        return;
    }
    currentPort = FALLBACK_PORTS[portIndex];
    console.log(`Trying to start WebSocket server on port ${currentPort}...`);
    try {
        // Create WebSocket server on current port
        ws.createServer({ port: currentPort });
        // Handle server state updates
        ws.onStateUpdate((state, error) => {
            console.log(`WebSocket server state: ${state} (port ${currentPort})`);
            if (state === "failed") {
                console.log(`WebSocket server failed on port ${currentPort}: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`);
                // If server failed and we haven't tried all ports, try next port
                if (!serverStarted && portIndex + 1 < FALLBACK_PORTS.length) {
                    console.log(`Trying next port...`);
                    setTimeout(() => {
                        tryStartServer(portIndex + 1);
                    }, 500);
                }
                else {
                    core.osd(`Web Remote: Server failed (tried ports ${FALLBACK_PORTS.slice(0, portIndex + 1).join(', ')})`);
                }
            }
            else if (state === "ready") {
                serverStarted = true;
                console.log(`WebSocket server is ready on port ${currentPort}`);
                core.osd(`Web Remote: Server ready on port ${currentPort}`);
                // Update help page with actual port information
                updateHelpPagePort();
            }
        });
        // Handle new connections
        ws.onNewConnection(conn => {
            console.log(`New WebSocket connection: ${conn}`);
            activeConnections.add(conn);
            core.osd("Web Remote: Device connected");
            // Send current status to new connection
            setTimeout(() => {
                sendStatusUpdate(conn);
            }, 100);
        });
        // Handle connection state changes
        ws.onConnectionStateUpdate((conn, state) => {
            console.log(`Connection ${conn} state: ${state}`);
            if (state === "cancelled" || state === "failed") {
                activeConnections.delete(conn);
                console.log(`Connection ${conn} disconnected`);
                core.osd("Web Remote: Device disconnected");
            }
        });
        // Handle incoming messages
        ws.onMessage((conn, message) => {
            try {
                const command = JSON.parse(message.text());
                console.log(`Received command from ${conn}:`, JSON.stringify(command));
                handleCommand(command, conn);
                // Send updated status after command (but not for identify requests)
                if (command.type !== 'identify') {
                    setTimeout(() => {
                        sendStatusUpdate(conn);
                    }, 100);
                }
            }
            catch (error) {
                console.log(`Failed to parse message from ${conn}: ${error}`);
            }
        });
        // Start the server
        ws.startServer();
        console.log(`WebSocket server start requested on port ${currentPort}`);
    }
    catch (error) {
        console.log(`Failed to setup WebSocket server on port ${currentPort}: ${error}`);
        // Try next port if available
        if (portIndex + 1 < FALLBACK_PORTS.length) {
            setTimeout(() => {
                tryStartServer(portIndex + 1);
            }, 500);
        }
        else {
            core.osd("Web Remote: Failed to start server");
        }
    }
}
/**
 * Update help page with current port information
 */
function updateHelpPagePort() {
    // This would ideally communicate with the help page
    // For now, just log the information
    console.log(`Server started successfully on port ${currentPort}`);
    // Get local network IP for help page
    getLocalNetworkIP().then(ip => {
        console.log(`Local network IP: ${ip}`);
        console.log(`Web interface should be accessible at: http://${ip}:8080`);
    }).catch(error => {
        console.log(`Failed to get local network IP: ${error}`);
    });
}
/**
 * Get local network IP address
 */
function getLocalNetworkIP() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Use shell command to get local IP
            const result = yield utils.exec("sh", ["-c", "ifconfig | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}'"]);
            if (result.stdout && result.stdout.trim()) {
                return result.stdout.trim();
            }
            // Fallback method
            const result2 = yield utils.exec("ipconfig", ["getifaddr", "en0"]);
            if (result2.stdout && result2.stdout.trim()) {
                return result2.stdout.trim();
            }
            throw new Error("Could not determine local IP");
        }
        catch (error) {
            console.log(`Error getting local IP: ${error}`);
            throw error;
        }
    });
}
/**
 * Handle incoming WebSocket commands
 */
function handleCommand(command, conn) {
    try {
        switch (command.type) {
            case 'identify':
                // Handle server identification request
                if (conn) {
                    handleIdentifyRequest(conn);
                }
                break;
            case 'play':
                mpv.set('pause', false);
                core.osd("▶️ Play");
                break;
            case 'pause':
                mpv.set('pause', true);
                core.osd("⏸️ Pause");
                break;
            case 'toggle-pause':
                const isPaused = mpv.getFlag('pause');
                mpv.set('pause', !isPaused);
                core.osd(isPaused ? "▶️ Play" : "⏸️ Pause");
                break;
            case 'seek':
                if (typeof command.position === 'number') {
                    handleSeekCommand(command.position);
                }
                else {
                    console.log('Invalid seek position:', command.position);
                }
                break;
            case 'skip-forward':
                const skipAmount = command.amount || 10;
                handleSkipCommand(skipAmount);
                break;
            case 'skip-backward':
                const skipBackAmount = command.amount || 10;
                handleSkipCommand(-skipBackAmount);
                break;
            case 'toggle-fullscreen':
                mpv.set('fullscreen', !mpv.getFlag('fullscreen'));
                core.osd("⛶ Toggle Fullscreen");
                break;
            case 'set-volume':
                if (typeof command.volume === 'number') {
                    const clampedVolume = Math.max(0, Math.min(100, command.volume));
                    mpv.set('volume', clampedVolume);
                    core.osd(`🔊 Volume: ${clampedVolume}%`);
                    console.log(`Volume set to: ${clampedVolume}%`);
                }
                else {
                    console.log('Invalid volume value:', command.volume);
                }
                break;
            case 'toggle-mute':
                const isMuted = mpv.getFlag('mute');
                mpv.set('mute', !isMuted);
                core.osd(isMuted ? "🔊 Unmuted" : "🔇 Muted");
                console.log(`Mute toggled: ${!isMuted ? 'muted' : 'unmuted'}`);
                break;
            case 'get-status':
                // Status will be sent automatically after this function
                break;
            default:
                console.log(`Unknown command type: ${command.type}`);
        }
    }
    catch (error) {
        console.log(`Error handling command: ${error}`);
    }
}
/**
 * Handle seek command with validation
 */
function handleSeekCommand(position) {
    try {
        const duration = mpv.getNumber('duration') || 0;
        // Validate seek position
        if (duration <= 0) {
            console.log('Cannot seek: no media loaded or invalid duration');
            core.osd("⚠️ Cannot seek: no media loaded");
            return;
        }
        // Clamp position to valid range
        const clampedPosition = Math.max(0, Math.min(position, duration));
        // Use MPV's time-pos property for seeking
        mpv.set('time-pos', clampedPosition);
        const minutes = Math.floor(clampedPosition / 60);
        const seconds = Math.floor(clampedPosition % 60);
        core.osd(`⏩ Seek to ${minutes}:${seconds.toString().padStart(2, '0')}`);
        console.log(`Seeking to position: ${clampedPosition}s (requested: ${position}s)`);
    }
    catch (error) {
        console.log(`Error in seek command: ${error}`);
        core.osd("⚠️ Seek failed");
    }
}
/**
 * Handle skip command (forward or backward)
 */
function handleSkipCommand(amount) {
    try {
        const currentPos = mpv.getNumber('time-pos') || 0;
        const duration = mpv.getNumber('duration') || 0;
        if (duration <= 0) {
            console.log('Cannot skip: no media loaded');
            core.osd("⚠️ Cannot skip: no media loaded");
            return;
        }
        // Calculate new position
        const newPosition = Math.max(0, Math.min(currentPos + amount, duration));
        // Use time-pos property for skipping
        mpv.set('time-pos', newPosition);
        const direction = amount > 0 ? '+' : '';
        core.osd(`${amount > 0 ? '⏩' : '⏪'} Skip ${direction}${amount}s`);
        console.log(`Skipping ${amount}s from ${currentPos}s to ${newPosition}s`);
    }
    catch (error) {
        console.log(`Error in skip command: ${error}`);
        core.osd("⚠️ Skip failed");
    }
}
/**
 * Handle server identification request
 */
function handleIdentifyRequest(conn) {
    try {
        // Get device name and network IP
        Promise.all([getDeviceName(), getLocalNetworkIP()]).then(([deviceName, networkIP]) => {
            const response = {
                type: 'server-info',
                data: {
                    application: 'IINA',
                    deviceName: deviceName,
                    name: `IINA Web Remote (${deviceName})`,
                    version: '1.0.0',
                    port: currentPort,
                    networkIP: networkIP,
                    timestamp: Date.now(),
                    capabilities: [
                        'play', 'pause', 'toggle-pause', 'seek',
                        'skip-forward', 'skip-backward', 'toggle-fullscreen',
                        'set-volume', 'toggle-mute', 'get-status'
                    ]
                }
            };
            console.log(`Sending server info to ${conn}:`, JSON.stringify(response));
            ws.sendText(conn, JSON.stringify(response)).then(result => {
                if (result === "no_connection") {
                    console.log(`Failed to send server info to ${conn}: connection not found`);
                }
                else {
                    console.log(`Successfully sent server info to ${conn}`);
                }
            }).catch(error => {
                console.log(`Error sending server info to ${conn}: ${error}`);
            });
        }).catch(error => {
            // Fallback if device info fails
            const response = {
                type: 'server-info',
                data: {
                    application: 'IINA',
                    deviceName: 'Unknown Mac',
                    name: 'IINA Web Remote Server',
                    version: '1.0.0',
                    port: currentPort,
                    networkIP: 'Unable to determine',
                    timestamp: Date.now(),
                    capabilities: [
                        'play', 'pause', 'toggle-pause', 'seek',
                        'skip-forward', 'skip-backward', 'toggle-fullscreen',
                        'set-volume', 'toggle-mute', 'get-status'
                    ]
                }
            };
            console.log(`Sending fallback server info to ${conn}:`, JSON.stringify(response));
            ws.sendText(conn, JSON.stringify(response)).then(result => {
                if (result === "no_connection") {
                    console.log(`Failed to send server info to ${conn}: connection not found`);
                }
            }).catch(error => {
                console.log(`Error sending server info to ${conn}: ${error}`);
            });
        });
    }
    catch (error) {
        console.log(`Error handling identification request: ${error}`);
    }
}
/**
 * Send status update to a specific connection
 */
function sendStatusUpdate(conn) {
    try {
        const status = getCurrentStatus();
        const message = {
            type: 'status',
            data: status
        };
        ws.sendText(conn, JSON.stringify(message)).then(result => {
            if (result === "no_connection") {
                console.log(`Failed to send status to ${conn}: connection not found`);
                activeConnections.delete(conn);
            }
        }).catch(error => {
            console.log(`Error sending status to ${conn}: ${error}`);
        });
    }
    catch (error) {
        console.log(`Error preparing status update: ${error}`);
    }
}
/**
 * Broadcast status update to all active connections
 */
function broadcastStatusUpdate() {
    const now = Date.now();
    // Throttle broadcasts to prevent spam
    if (now - lastStatusBroadcast < STATUS_BROADCAST_THROTTLE) {
        return;
    }
    lastStatusBroadcast = now;
    if (activeConnections.size === 0) {
        return;
    }
    try {
        const status = getCurrentStatus();
        const message = {
            type: 'status',
            data: status
        };
        const messageText = JSON.stringify(message);
        // Send to all active connections
        activeConnections.forEach(conn => {
            ws.sendText(conn, messageText).then(result => {
                if (result === "no_connection") {
                    activeConnections.delete(conn);
                }
            }).catch(error => {
                console.log(`Error broadcasting to ${conn}: ${error}`);
                activeConnections.delete(conn);
            });
        });
    }
    catch (error) {
        console.log(`Error preparing broadcast: ${error}`);
    }
}
/**
 * Set up event listeners for IINA/MPV events
 */
function setupEventListeners() {
    console.log("Setting up event listeners...");
    // Listen for playback state changes
    event.on('mpv.pause', () => {
        console.log("Playback paused");
        broadcastStatusUpdate();
    });
    event.on('mpv.unpause', () => {
        console.log("Playback resumed");
        broadcastStatusUpdate();
    });
    // Listen for file loaded events
    event.on('mpv.file-loaded', () => {
        console.log("File loaded");
        const status = getCurrentStatus();
        core.osd(`Now playing: ${status.title}`);
        broadcastStatusUpdate();
    });
    // Listen for seek events
    event.on('mpv.seek', () => {
        console.log("Seek performed");
        broadcastStatusUpdate();
    });
    // Listen for time position changes (throttled)
    event.on('mpv.time-pos', () => {
        broadcastStatusUpdate();
    });
    // Listen for duration changes
    event.on('mpv.duration', () => {
        console.log("Duration changed");
        broadcastStatusUpdate();
    });
    // Listen for fullscreen changes
    event.on('mpv.fullscreen', () => {
        console.log("Fullscreen toggled");
        broadcastStatusUpdate();
    });
    // Listen for volume changes
    event.on('mpv.volume', () => {
        console.log("Volume changed");
        broadcastStatusUpdate();
    });
    // Listen for mute changes
    event.on('mpv.mute', () => {
        console.log("Mute toggled");
        broadcastStatusUpdate();
    });
    console.log("Event listeners set up successfully");
}
/**
 * Get current playback status with enhanced media information
 */
function getCurrentStatus() {
    try {
        const isPaused = mpv.getFlag('pause') || false;
        const timePos = mpv.getNumber('time-pos') || 0;
        const duration = mpv.getNumber('duration') || 0;
        const filename = mpv.getString('filename') || 'No media loaded';
        const mediaTitle = mpv.getString('media-title') || filename;
        const isFullscreen = mpv.getFlag('fullscreen') || false;
        // Additional media properties
        const fileFormat = mpv.getString('file-format') || '';
        const videoCodec = mpv.getString('video-codec') || '';
        const audioCodec = mpv.getString('audio-codec') || '';
        const videoWidth = mpv.getNumber('width') || 0;
        const videoHeight = mpv.getNumber('height') || 0;
        const videoBitrate = mpv.getNumber('video-bitrate') || 0;
        const audioBitrate = mpv.getNumber('audio-bitrate') || 0;
        const fps = mpv.getNumber('estimated-vf-fps') || 0;
        // Playback properties
        const volume = mpv.getNumber('volume') || 100;
        const muted = mpv.getFlag('mute') || false;
        const speed = mpv.getNumber('speed') || 1.0;
        // Calculate progress percentage
        const progress = duration > 0 ? (timePos / duration) * 100 : 0;
        return {
            // Basic playback info
            paused: isPaused,
            timePos: Math.round(timePos * 100) / 100, // Round to 2 decimal places
            duration: Math.round(duration * 100) / 100,
            progress: Math.round(progress * 100) / 100,
            hasMedia: duration > 0,
            // Media information
            filename: filename,
            title: mediaTitle,
            fileFormat: fileFormat,
            // Video properties
            videoCodec: videoCodec,
            videoWidth: videoWidth,
            videoHeight: videoHeight,
            videoBitrate: videoBitrate,
            fps: Math.round(fps * 100) / 100,
            // Audio properties
            audioCodec: audioCodec,
            audioBitrate: audioBitrate,
            // Playback state
            fullscreen: isFullscreen,
            volume: Math.round(volume),
            muted: muted,
            speed: speed,
            // Formatted time strings for display
            timeFormatted: formatTime(timePos),
            durationFormatted: formatTime(duration),
            // Timestamp for status freshness
            timestamp: Date.now()
        };
    }
    catch (error) {
        console.log(`Failed to get current status: ${error}`);
        return {
            paused: true,
            timePos: 0,
            duration: 0,
            progress: 0,
            hasMedia: false,
            filename: 'No media loaded',
            title: 'No media loaded',
            fileFormat: '',
            videoCodec: '',
            videoWidth: 0,
            videoHeight: 0,
            videoBitrate: 0,
            fps: 0,
            audioCodec: '',
            audioBitrate: 0,
            fullscreen: false,
            volume: 100,
            muted: false,
            speed: 1.0,
            timeFormatted: '0:00',
            durationFormatted: '0:00',
            timestamp: Date.now()
        };
    }
}
/**
 * Format time in seconds to MM:SS or HH:MM:SS format
 */
function formatTime(seconds) {
    if (!seconds || seconds < 0)
        return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}
/**
 * Log current status to console
 */
function logCurrentStatus() {
    const status = getCurrentStatus();
    console.log("Current Status:", JSON.stringify({
        title: status.title,
        paused: status.paused,
        timePos: status.timePos,
        duration: status.duration,
        progress: status.progress,
        hasMedia: status.hasMedia
    }, null, 2));
}
/**
 * Get device name for identification
 */
function getDeviceName() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // This requires file-system permission
            const result = yield utils.exec('scutil', ['--get', 'ComputerName']);
            return result.stdout.trim() || 'IINA Device';
        }
        catch (error) {
            console.log(`Failed to get device name: ${error}`);
            return 'IINA Device';
        }
    });
}
/**
 * Cleanup when plugin is unloaded
 */
function cleanup() {
    console.log("IINA Web Remote Plugin: Cleaning up...");
    activeConnections.clear();
    console.log("IINA Web Remote Plugin: Cleanup complete");
}
// Initialize the plugin
init();
