# IINA Web Remote Plugin

A web-based remote control for IINA video player that allows you to control playback from any device on your local network.

## Installation

### Method 1: GitHub URL (Recommended - Auto-update)
1. Open IINA
2. Go to **Preferences > Plugins**
3. Click the **"+"** button
4. Enter: `lexwolfy/iina-remote-plugin`
5. Click **"Install"**

### Method 2: Manual Download
1. Download the latest `.iinaplgz` file from [Releases](https://github.com/lexwolfy/iina-remote/releases)
2. Double-click the downloaded file to install in IINA

## Usage

After installation:
1. Open IINA and load a video
2. The plugin will automatically start a WebSocket server on port 10010
3. Visit the web interface at **https://lexwolfy.github.io/iina-remote** from any device
4. Connect to your IINA instance and control playback remotely

## Features

- **Play/Pause Control** - Start and stop video playback
- **Seek Functionality** - Jump to any position in the video
- **Skip Controls** - Skip forward/backward by 10 seconds
- **Real-time Status** - Live updates of playback state and position
- **Mobile-Optimized** - Touch-friendly interface for phones and tablets
- **Network Discovery** - Automatic detection of IINA instances on your network
- **Responsive Design** - Works on all screen sizes and devices

## Web Interface

Access the remote control at: **https://lexwolfy.github.io/iina-remote**

The web interface provides:
- Modern, IINA-inspired design
- Mobile-first responsive layout
- Real-time connection status
- Network discovery and manual connection options
- Comprehensive media information display

## Requirements

- **IINA**: Version 1.4.0 or later
- **macOS**: Version 10.15 (Catalina) or later
- **Network**: Local network access for remote control functionality

## Troubleshooting

### Plugin Not Loading
- Ensure you have IINA 1.4.0 or later
- Check that the plugin appears in **Preferences > Plugins**
- Restart IINA after installation

### Cannot Connect from Web Interface
- Verify IINA is running with a video loaded
- Check that port 10010 is not blocked by firewall
- Ensure both devices are on the same network
- Try manual connection with your computer's IP address

### Network Discovery Issues
- Use manual connection with IP address: `192.168.1.xxx:10010`
- Check your router's DHCP settings
- Verify devices are on the same subnet

## Source Code

This is the distribution repository for the IINA Web Remote Plugin. 

**Development Repository**: https://github.com/lexwolfy/iina-remote

## Support

- **Issues**: Report bugs at https://github.com/lexwolfy/iina-remote/issues
- **Documentation**: Full documentation at https://github.com/lexwolfy/iina-remote
- **Updates**: This repository is automatically updated with new releases

## License

This project is open source. See the main repository for license details.

---

**Note**: This repository is automatically maintained by GitHub Actions. The plugin files are built and deployed from the main development repository.
