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
const { core, event, mpv, utils, ws, standaloneWindow, menu } = iina;
const iinaConsole = iina.console;
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
    iinaConsole.log("IINA Web Remote Plugin: Initializing...");
    // Set up WebSocket server
    setupWebSocket();
    // Set up event listeners
    setupEventListeners();
    // Set up menu items
    setupMenu();
    // Show initialization message
    core.osd("IINA Web Remote Plugin: Loaded");
    iinaConsole.log("IINA Web Remote Plugin: Initialized successfully");
    // Set up standalone window message handlers
    setupWindowMessageHandlers();
    // Log device information
    getDeviceName().then(deviceName => {
        iinaConsole.log(`Device name: ${deviceName}`);
    }).catch(error => {
        iinaConsole.log(`Failed to get device name: ${error}`);
    });
}
/**
 * Set up menu items
 */
function setupMenu() {
    iinaConsole.log("IINA Web Remote: Setting up menu items...");
    try {
        menu.addItem(menu.item("Web Remote Connection...", () => {
            iinaConsole.log("IINA Web Remote: Menu item clicked, opening connection window");
            showConnectionWindow();
        }));
        iinaConsole.log("IINA Web Remote: Menu items added successfully");
    }
    catch (error) {
        iinaConsole.log(`IINA Web Remote: Failed to setup menu: ${error}`);
    }
}
/**
 * Show the connection window with QR code
 */
function showConnectionWindow() {
    iinaConsole.log("IINA Web Remote: Opening connection window...");
    try {
        // Load the connection window HTML file
        iinaConsole.log("IINA Web Remote: Loading connection.html");
        standaloneWindow.loadFile("connection.html");
        // Set window properties
        iinaConsole.log("IINA Web Remote: Setting window properties");
        standaloneWindow.setProperty({
            title: "IINA Web Remote Connection",
            resizable: true,
            fullSizeContentView: false,
            hideTitleBar: false
        });
        // Set window size
        iinaConsole.log("IINA Web Remote: Setting window size to 600x700");
        standaloneWindow.setFrame(600, 700);
        // Set up message handlers RIGHT HERE - after loadFile, before open (plugin-online-media pattern)
        iinaConsole.log("IINA Web Remote: Setting up window message handlers");
        standaloneWindow.onMessage("requestConnection", () => {
            iinaConsole.log("=== PLUGIN: Received requestConnection from window ===");
            sendConnectionInfoToWindow();
        });
        standaloneWindow.onMessage("refresh", () => {
            iinaConsole.log("=== PLUGIN: Received refresh from window ===");
            sendConnectionInfoToWindow();
        });
        iinaConsole.log("IINA Web Remote: Message handlers set up successfully");
        // Open the window
        iinaConsole.log("IINA Web Remote: Opening standalone window");
        standaloneWindow.open();
        iinaConsole.log("IINA Web Remote: Connection window opened successfully");
    }
    catch (error) {
        iinaConsole.log(`IINA Web Remote: Failed to open connection window: ${error}`);
    }
}
/**
 * Set up standalone window message handlers (called during initialization)
 */
function setupWindowMessageHandlers() {
    iinaConsole.log("=== PLUGIN: Setting up global window message handlers ===");
    // Message handlers are now set up directly in showConnectionWindow() following plugin-online-media pattern
}
/**
 * Set up WebSocket server for remote control
 */
function setupWebSocket() {
    iinaConsole.log("Setting up WebSocket server...");
    // Try to start server on available port
    tryStartServer(0);
}
/**
 * Try to start WebSocket server on available port
 */
function tryStartServer(portIndex) {
    if (portIndex >= FALLBACK_PORTS.length) {
        iinaConsole.log("Failed to start WebSocket server: no available ports");
        core.osd("Web Remote: No available ports");
        return;
    }
    currentPort = FALLBACK_PORTS[portIndex];
    iinaConsole.log(`Trying to start WebSocket server on port ${currentPort}...`);
    try {
        // Create WebSocket server on current port
        ws.createServer({ port: currentPort });
        // Handle server state updates
        ws.onStateUpdate((state, error) => {
            iinaConsole.log(`WebSocket server state: ${state} (port ${currentPort})`);
            if (state === "failed") {
                iinaConsole.log(`WebSocket server failed on port ${currentPort}: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`);
                // If server failed and we haven't tried all ports, try next port
                if (!serverStarted && portIndex + 1 < FALLBACK_PORTS.length) {
                    iinaConsole.log(`Trying next port...`);
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
                iinaConsole.log(`WebSocket server is ready on port ${currentPort}`);
                core.osd(`Web Remote: Server ready on port ${currentPort}`);
                // Update help page with actual port information
                updateHelpPagePort();
            }
        });
        // Handle new connections
        ws.onNewConnection(conn => {
            iinaConsole.log(`New WebSocket connection: ${conn}`);
            activeConnections.add(conn);
            core.osd("Web Remote: Device connected");
            // Send current status to new connection
            setTimeout(() => {
                sendStatusUpdate(conn);
            }, 100);
        });
        // Handle connection state changes
        ws.onConnectionStateUpdate((conn, state) => {
            iinaConsole.log(`Connection ${conn} state: ${state}`);
            if (state === "cancelled" || state === "failed") {
                activeConnections.delete(conn);
                iinaConsole.log(`Connection ${conn} disconnected`);
                core.osd("Web Remote: Device disconnected");
            }
        });
        // Handle incoming messages
        ws.onMessage((conn, message) => {
            try {
                const command = JSON.parse(message.text());
                iinaConsole.log(`Received command from ${conn}:`, JSON.stringify(command));
                handleCommand(command, conn);
                // Send updated status after command (but not for identify requests)
                if (command.type !== 'identify') {
                    setTimeout(() => {
                        sendStatusUpdate(conn);
                    }, 100);
                }
            }
            catch (error) {
                iinaConsole.log(`Failed to parse message from ${conn}: ${error}`);
            }
        });
        // Start the server
        ws.startServer();
        iinaConsole.log(`WebSocket server start requested on port ${currentPort}`);
    }
    catch (error) {
        iinaConsole.log(`Failed to setup WebSocket server on port ${currentPort}: ${error}`);
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
    iinaConsole.log(`Server started successfully on port ${currentPort}`);
    // Get local network IP and update standalone window
    getLocalNetworkIP().then(ip => {
        iinaConsole.log(`Local network IP: ${ip}`);
        iinaConsole.log(`Web interface should be accessible at: http://${ip}:8080`);
        // Update standalone window with connection info (if open)
        updateStandaloneWindow(ip, currentPort);
    }).catch(error => {
        iinaConsole.log(`Failed to get local network IP: ${error}`);
    });
}
/**
 * Update standalone window with connection information
 */
function updateStandaloneWindow(ip, port) {
    try {
        standaloneWindow.postMessage("connection-info", {
            ip: ip,
            port: port,
            status: 'connected'
        });
        iinaConsole.log(`Updated standalone window with IP: ${ip}, Port: ${port}`);
    }
    catch (error) {
        iinaConsole.log(`Failed to update standalone window: ${error}`);
    }
}
/**
 * Send connection info to standalone window
 */
function sendConnectionInfoToWindow() {
    iinaConsole.log(`=== PLUGIN: sendConnectionInfoToWindow called ===`);
    iinaConsole.log(`=== PLUGIN: serverStarted: ${serverStarted}, currentPort: ${currentPort} ===`);
    if (serverStarted) {
        iinaConsole.log("=== PLUGIN: Server is started, getting network IP ===");
        getLocalNetworkIP().then(ip => {
            const connectionData = {
                ip: ip,
                port: currentPort.toString(),
                status: 'connected'
            };
            iinaConsole.log("=== PLUGIN: Sending connectionUpdate to window:", JSON.stringify(connectionData));
            try {
                standaloneWindow.postMessage("connectionUpdate", connectionData);
                iinaConsole.log("=== PLUGIN: connectionUpdate message sent successfully ===");
            }
            catch (error) {
                iinaConsole.log(`=== PLUGIN: Error sending connectionUpdate: ${error} ===`);
            }
        }).catch(error => {
            iinaConsole.log(`=== PLUGIN: Failed to get network IP: ${error} ===`);
            const errorData = {
                ip: null,
                port: null,
                status: 'Failed to get network info'
            };
            iinaConsole.log("=== PLUGIN: Sending connectionUpdate with error:", JSON.stringify(errorData));
            try {
                standaloneWindow.postMessage("connectionUpdate", errorData);
                iinaConsole.log("=== PLUGIN: connectionUpdate error message sent successfully ===");
            }
            catch (error) {
                iinaConsole.log(`=== PLUGIN: Error sending connectionUpdate error: ${error} ===`);
            }
        });
    }
    else {
        iinaConsole.log("=== PLUGIN: Server not started yet ===");
        const pendingData = {
            ip: null,
            port: null,
            status: 'Server starting...'
        };
        iinaConsole.log("=== PLUGIN: Sending connectionUpdate with pending status:", JSON.stringify(pendingData));
        try {
            standaloneWindow.postMessage("connectionUpdate", pendingData);
            iinaConsole.log("=== PLUGIN: connectionUpdate pending message sent successfully ===");
        }
        catch (error) {
            iinaConsole.log(`=== PLUGIN: Error sending connectionUpdate pending: ${error} ===`);
        }
    }
}
/**
 * Get local network IP address
 */
function getLocalNetworkIP() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            iinaConsole.log("IINA Web Remote: Attempting to get local IP address...");
            // Method 1: Use ifconfig with full path
            iinaConsole.log("IINA Web Remote: Trying ifconfig method...");
            const result = yield utils.exec("/sbin/ifconfig", []);
            iinaConsole.log(`IINA Web Remote: ifconfig result status: ${result.status}`);
            if (result.status === 0 && result.stdout) {
                iinaConsole.log("IINA Web Remote: ifconfig succeeded, parsing output...");
                const lines = result.stdout.split('\n');
                for (const line of lines) {
                    if (line.includes('inet ') && !line.includes('127.0.0.1') && !line.includes('::1')) {
                        const match = line.match(/inet (\d+\.\d+\.\d+\.\d+)/);
                        if (match) {
                            const ip = match[1];
                            iinaConsole.log(`IINA Web Remote: Found IP address: ${ip}`);
                            return ip;
                        }
                    }
                }
            }
            // Method 2: Try a simpler approach
            iinaConsole.log("IINA Web Remote: Trying scutil method...");
            const result2 = yield utils.exec("/usr/sbin/scutil", ["--nwi"]);
            iinaConsole.log(`IINA Web Remote: scutil result status: ${result2.status}`);
            if (result2.status === 0 && result2.stdout) {
                iinaConsole.log("IINA Web Remote: scutil output:", result2.stdout.substring(0, 200));
            }
            // Method 3: Fallback to a common IP
            iinaConsole.log("IINA Web Remote: Using fallback - checking route...");
            const result3 = yield utils.exec("/sbin/route", ["-n", "get", "default"]);
            if (result3.status === 0 && result3.stdout) {
                iinaConsole.log("IINA Web Remote: route output:", result3.stdout.substring(0, 200));
            }
            throw new Error("Could not determine local IP using any method");
        }
        catch (error) {
            iinaConsole.log(`IINA Web Remote: Error getting local IP: ${error}`);
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
                    iinaConsole.log('Invalid seek position:', command.position);
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
                    iinaConsole.log(`Volume set to: ${clampedVolume}%`);
                }
                else {
                    iinaConsole.log('Invalid volume value:', command.volume);
                }
                break;
            case 'toggle-mute':
                const isMuted = mpv.getFlag('mute');
                mpv.set('mute', !isMuted);
                core.osd(isMuted ? "🔊 Unmuted" : "🔇 Muted");
                iinaConsole.log(`Mute toggled: ${!isMuted ? 'muted' : 'unmuted'}`);
                break;
            case 'get-status':
                // Status will be sent automatically after this function
                break;
            default:
                iinaConsole.log(`Unknown command type: ${command.type}`);
        }
    }
    catch (error) {
        iinaConsole.log(`Error handling command: ${error}`);
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
            iinaConsole.log('Cannot seek: no media loaded or invalid duration');
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
        iinaConsole.log(`Seeking to position: ${clampedPosition}s (requested: ${position}s)`);
    }
    catch (error) {
        iinaConsole.log(`Error in seek command: ${error}`);
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
            iinaConsole.log('Cannot skip: no media loaded');
            core.osd("⚠️ Cannot skip: no media loaded");
            return;
        }
        // Calculate new position
        const newPosition = Math.max(0, Math.min(currentPos + amount, duration));
        // Use time-pos property for skipping
        mpv.set('time-pos', newPosition);
        const direction = amount > 0 ? '+' : '';
        core.osd(`${amount > 0 ? '⏩' : '⏪'} Skip ${direction}${amount}s`);
        iinaConsole.log(`Skipping ${amount}s from ${currentPos}s to ${newPosition}s`);
    }
    catch (error) {
        iinaConsole.log(`Error in skip command: ${error}`);
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
                    version: '1.0.0-beta.3',
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
            iinaConsole.log(`Sending server info to ${conn}:`, JSON.stringify(response));
            ws.sendText(conn, JSON.stringify(response)).then(result => {
                if (result === "no_connection") {
                    iinaConsole.log(`Failed to send server info to ${conn}: connection not found`);
                }
                else {
                    iinaConsole.log(`Successfully sent server info to ${conn}`);
                }
            }).catch(error => {
                iinaConsole.log(`Error sending server info to ${conn}: ${error}`);
            });
        }).catch(error => {
            // Fallback if device info fails
            const response = {
                type: 'server-info',
                data: {
                    application: 'IINA',
                    deviceName: 'Unknown Mac',
                    name: 'IINA Web Remote Server',
                    version: '1.0.0-beta.3',
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
            iinaConsole.log(`Sending fallback server info to ${conn}:`, JSON.stringify(response));
            ws.sendText(conn, JSON.stringify(response)).then(result => {
                if (result === "no_connection") {
                    iinaConsole.log(`Failed to send server info to ${conn}: connection not found`);
                }
            }).catch(error => {
                iinaConsole.log(`Error sending server info to ${conn}: ${error}`);
            });
        });
    }
    catch (error) {
        iinaConsole.log(`Error handling identification request: ${error}`);
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
                iinaConsole.log(`Failed to send status to ${conn}: connection not found`);
                activeConnections.delete(conn);
            }
        }).catch(error => {
            iinaConsole.log(`Error sending status to ${conn}: ${error}`);
        });
    }
    catch (error) {
        iinaConsole.log(`Error preparing status update: ${error}`);
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
                iinaConsole.log(`Error broadcasting to ${conn}: ${error}`);
                activeConnections.delete(conn);
            });
        });
    }
    catch (error) {
        iinaConsole.log(`Error preparing broadcast: ${error}`);
    }
}
/**
 * Set up event listeners for IINA/MPV events
 */
function setupEventListeners() {
    iinaConsole.log("Setting up event listeners...");
    // Listen for playback state changes
    event.on('mpv.pause', () => {
        iinaConsole.log("Playback paused");
        broadcastStatusUpdate();
    });
    event.on('mpv.unpause', () => {
        iinaConsole.log("Playback resumed");
        broadcastStatusUpdate();
    });
    // Listen for file loaded events
    event.on('mpv.file-loaded', () => {
        iinaConsole.log("File loaded");
        const status = getCurrentStatus();
        core.osd(`Now playing: ${status.title}`);
        broadcastStatusUpdate();
    });
    // Listen for seek events
    event.on('mpv.seek', () => {
        iinaConsole.log("Seek performed");
        broadcastStatusUpdate();
    });
    // Listen for time position changes (throttled)
    event.on('mpv.time-pos', () => {
        broadcastStatusUpdate();
    });
    // Listen for duration changes
    event.on('mpv.duration', () => {
        iinaConsole.log("Duration changed");
        broadcastStatusUpdate();
    });
    // Listen for fullscreen changes
    event.on('mpv.fullscreen', () => {
        iinaConsole.log("Fullscreen toggled");
        broadcastStatusUpdate();
    });
    // Listen for volume changes
    event.on('mpv.volume', () => {
        iinaConsole.log("Volume changed");
        broadcastStatusUpdate();
    });
    // Listen for mute changes
    event.on('mpv.mute', () => {
        iinaConsole.log("Mute toggled");
        broadcastStatusUpdate();
    });
    iinaConsole.log("Event listeners set up successfully");
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
        iinaConsole.log(`Failed to get current status: ${error}`);
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
 * Log current status to iinaConsole
 */
function logCurrentStatus() {
    const status = getCurrentStatus();
    iinaConsole.log("Current Status:", JSON.stringify({
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
            iinaConsole.log(`Failed to get device name: ${error}`);
            return 'IINA Device';
        }
    });
}
/**
 * Cleanup when plugin is unloaded
 */
function cleanup() {
    iinaConsole.log("IINA Web Remote Plugin: Cleaning up...");
    activeConnections.clear();
    // Close standalone window
    try {
        standaloneWindow.close();
        iinaConsole.log("Standalone window closed");
    }
    catch (error) {
        iinaConsole.log(`Error closing standalone window: ${error}`);
    }
    iinaConsole.log("IINA Web Remote Plugin: Cleanup complete");
}
// Initialize the plugin
init();
