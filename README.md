# Vidmet - Simple Video Calling Application

A minimal WebRTC-based one-to-one video calling application built with Node.js, Express, and vanilla JavaScript.

## Features

- One-to-one peer-to-peer video calls
- Real-time peer discovery
- Mute/unmute audio and video controls
- Clean, responsive UI
- Public STUN servers for NAT traversal

## Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: HTML5, CSS3, vanilla JavaScript
- **Protocol**: WebRTC for media, WebSocket for signaling

## Prerequisites

- Node.js (v14 or higher)
- npm
- Modern browser with WebRTC support (Chrome, Firefox, Edge, Safari)
- Webcam and microphone

## Installation

1. Navigate to the project directory:
   ```bash
   cd vidmet
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

1. Start the signaling server:
   ```bash
   npm start
   ```

   The server will run on `http://localhost:3000`

2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

3. **For two peers to call each other:**
   - Open the page in two different browser tabs/windows
   - Each will get a unique peer ID
   - In one window, select the peer from the dropdown and click "Call"
   - The other peer will see an incoming call notification
   - Once connected, both can see each other's video

## Controls

- **Call Button**: Initiate a call to the selected peer
- **Hang Up Button**: End the current call
- **Video Button**: Toggle your video on/off
- **Audio Button**: Toggle your microphone on/off

## Project Structure

```
vidmet/
├── server/
│   └── server.js          # Express server + WebSocket signaling
├── client/
│   ├── index.html         # HTML interface
│   ├── client.js          # WebRTC and signaling logic
│   └── styles.css         # Styling
├── package.json           # Dependencies
└── README.md              # This file
```

## How It Works

1. **Server Setup**: Express serves static files and WebSocket handles real-time signaling
2. **Registration**: Each client registers with the server on connection
3. **Peer Discovery**: Clients can request a list of available peers
4. **Signaling**: WebSocket facilitates SDP offers/answers and ICE candidates
5. **Connection**: WebRTC establishes P2P media connection
6. **Media Flow**: Audio/video streams flow directly between peers

## Troubleshooting

### Camera/Microphone access denied
- Check browser permissions
- Allow camera and microphone access when prompted

### Cannot see remote video
- Ensure both peers are connected
- Check browser console for errors
- Verify network connectivity

### Connection drops
- Check network stability
- Firewall may block WebRTC connections on some networks
- Consider using a TURN server for restricted networks

## Future Enhancements

- Group video calls
- Screen sharing
- Text chat
- Recording functionality
- TURN server support
- Mobile optimization

## License

MIT

## Notes

- This is a basic implementation for learning/demo purposes
- For production, consider using a proper TURN server for users behind restrictive firewalls
- Add authentication and encryption for security
- Scale considerations needed for multiple concurrent calls
