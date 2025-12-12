class GroupVideoCaller {
  constructor() {
    this.ws = null;
    this.peerConnections = new Map(); // peerId -> RTCPeerConnection
    this.localStream = null;
    this.remoteStreams = new Map(); // peerId -> MediaStream
    this.clientId = `user-${Date.now()}`;
    this.callId = null;
    this.callActive = false;

    // STUN servers
    this.iceServers = [
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:stun1.l.google.com:19302'] }
    ];

    // UI Elements
    this.videosContainer = document.getElementById('videos-container');
    this.localVideo = document.getElementById('local-video');
    this.statusEl = document.getElementById('status');
    this.callStatusEl = document.getElementById('call-status');
    this.peerSelect = document.getElementById('peer-select');
    this.startCallBtn = document.getElementById('start-call-btn');
    this.addPeerBtn = document.getElementById('add-peer-btn');
    this.hangUpBtn = document.getElementById('hang-up-btn');
    this.toggleVideoBtn = document.getElementById('toggle-video-btn');
    this.toggleAudioBtn = document.getElementById('toggle-audio-btn');

    this.init();
  }

  async init() {
    try {
      // Get user media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      this.localVideo.srcObject = this.localStream;
      this.updateStatus('Ready to call');

      // Connect to server
      this.connectToServer();

      // Attach event listeners
      this.setupEventListeners();
    } catch (error) {
      console.error('Error accessing media devices:', error);
      this.updateStatus('Error: Could not access camera/microphone');
    }
  }

  connectToServer() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);

    this.ws.onopen = () => {
      console.log('Connected to signaling server');
      this.ws.send(JSON.stringify({
        type: 'register',
        id: this.clientId
      }));
      this.updatePeersList();
    };

    this.ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await this.handleSignalingMessage(message);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('Disconnected from signaling server');
      this.updateStatus('Disconnected from server');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateStatus('Connection error');
    };
  }

  async handleSignalingMessage(message) {
    switch (message.type) {
      case 'peers-list':
        this.updatePeersUI(message.peers);
        break;

      case 'call-created':
        this.callId = message.callId;
        this.callActive = true;
        this.updateCallStatus(`Call started: ${this.callId}`);
        break;

      case 'peer-joined':
        await this.handlePeerJoined(message);
        break;

      case 'offer':
        await this.handleOffer(message);
        break;

      case 'answer':
        await this.handleAnswer(message);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(message);
        break;

      case 'peer-left':
        this.handlePeerLeft(message.peerId);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  setupEventListeners() {
    this.startCallBtn.addEventListener('click', () => this.startNewCall());
    this.addPeerBtn.addEventListener('click', () => this.addPeerToCall());
    this.hangUpBtn.addEventListener('click', () => this.hangUp());
    this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
    this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());

    // Update peers list periodically
    setInterval(() => this.updatePeersList(), 3000);
  }

  updatePeersList() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'get-peers' }));
    }
  }

  updatePeersUI(peers) {
    const currentValue = this.peerSelect.value;
    const options = this.peerSelect.querySelectorAll('option:not(:first-child)');
    options.forEach(opt => opt.remove());

    // Filter out peers already in the call
    const availablePeers = peers.filter(peerId => 
      !this.peerConnections.has(peerId)
    );

    availablePeers.forEach(peerId => {
      const option = document.createElement('option');
      option.value = peerId;
      option.textContent = peerId;
      this.peerSelect.appendChild(option);
    });

    this.addPeerBtn.disabled = availablePeers.length === 0 || !this.callActive;
  }

  startNewCall() {
    this.ws.send(JSON.stringify({ type: 'create-call' }));
  }

  async addPeerToCall() {
    const remotePeerId = this.peerSelect.value;
    if (!remotePeerId) {
      alert('Please select a peer');
      return;
    }

    // Join the peer to existing call
    this.ws.send(JSON.stringify({
      type: 'join-call',
      callId: this.callId
    }));

    // Create connection to the new peer
    await this.createPeerConnection(remotePeerId);
    await this.createAndSendOffer(remotePeerId);
    this.updateStatus(`Adding ${remotePeerId}...`);
  }

  async handlePeerJoined(message) {
    const peerId = message.peerId;
    const allPeers = message.allPeers;

    // Create connection to new peer if not already exists
    if (!this.peerConnections.has(peerId)) {
      await this.createPeerConnection(peerId);
      await this.createAndSendOffer(peerId);
    }

    this.updateStatus(`${peerId} joined the call`);
    this.updateCallStatus(`Participants: ${allPeers.length}`);
  }

  async createPeerConnection(remotePeerId) {
    if (this.peerConnections.has(remotePeerId)) {
      return;
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    // Add local stream tracks
    this.localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, this.localStream);
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          target: remotePeerId,
          data: event.candidate
        }));
      }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('Received remote track from', remotePeerId, event.track.kind);
      if (!this.remoteStreams.has(remotePeerId)) {
        const remoteStream = new MediaStream();
        this.remoteStreams.set(remotePeerId, remoteStream);
        this.addRemoteVideo(remotePeerId, remoteStream);
      }
      this.remoteStreams.get(remotePeerId).addTrack(event.track);
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state with ${remotePeerId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'connected') {
        this.updateStatus(`Connected to ${remotePeerId}`);
      } else if (['disconnected', 'failed', 'closed'].includes(peerConnection.connectionState)) {
        this.removePeerConnection(remotePeerId);
      }
    };

    this.peerConnections.set(remotePeerId, peerConnection);
  }

  async createAndSendOffer(remotePeerId) {
    try {
      const peerConnection = this.peerConnections.get(remotePeerId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      this.ws.send(JSON.stringify({
        type: 'offer',
        target: remotePeerId,
        data: offer
      }));
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  async handleOffer(message) {
    const peerId = message.from;

    if (!this.peerConnections.has(peerId)) {
      await this.createPeerConnection(peerId);
    }

    try {
      const peerConnection = this.peerConnections.get(peerId);
      const offer = new RTCSessionDescription(message.data);
      await peerConnection.setRemoteDescription(offer);

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      this.ws.send(JSON.stringify({
        type: 'answer',
        target: peerId,
        data: answer
      }));
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  async handleAnswer(message) {
    const peerId = message.from;
    try {
      const peerConnection = this.peerConnections.get(peerId);
      if (peerConnection) {
        const answer = new RTCSessionDescription(message.data);
        await peerConnection.setRemoteDescription(answer);
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  async handleIceCandidate(message) {
    const peerId = message.from;
    try {
      const peerConnection = this.peerConnections.get(peerId);
      if (peerConnection && message.data) {
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(message.data)
        );
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  addRemoteVideo(peerId, remoteStream) {
    const videoBox = document.createElement('div');
    videoBox.className = 'video-box';
    videoBox.id = `video-${peerId}`;

    const video = document.createElement('video');
    video.id = `remote-video-${peerId}`;
    video.autoplay = true;
    video.playsinline = true;
    video.srcObject = remoteStream;

    const label = document.createElement('span');
    label.className = 'video-label';
    label.textContent = peerId.substring(0, 12);

    videoBox.appendChild(video);
    videoBox.appendChild(label);
    this.videosContainer.appendChild(videoBox);
  }

  removeRemoteVideo(peerId) {
    const videoBox = document.getElementById(`video-${peerId}`);
    if (videoBox) {
      videoBox.remove();
    }
  }

  removePeerConnection(peerId) {
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(peerId);
    }

    if (this.remoteStreams.has(peerId)) {
      this.remoteStreams.get(peerId).getTracks().forEach(track => track.stop());
      this.remoteStreams.delete(peerId);
    }

    this.removeRemoteVideo(peerId);
    this.updateCallStatus(`Participants: ${this.peerConnections.size + 1}`);
  }

  handlePeerLeft(peerId) {
    this.removePeerConnection(peerId);
    this.updateStatus(`${peerId} left the call`);
  }

  hangUp() {
    // Close all peer connections
    this.peerConnections.forEach((pc, peerId) => {
      pc.close();
      this.removeRemoteVideo(peerId);
    });

    this.peerConnections.clear();
    this.remoteStreams.clear();

    this.callActive = false;
    this.callId = null;
    this.updateStatus('Call ended');
    this.updateCallStatus('');
    this.startCallBtn.disabled = false;
    this.hangUpBtn.disabled = true;
  }

  toggleVideo() {
    if (!this.localStream) return;

    const videoTracks = this.localStream.getVideoTracks();
    const enabled = videoTracks[0]?.enabled || false;

    videoTracks.forEach(track => {
      track.enabled = !enabled;
    });

    this.toggleVideoBtn.textContent = !enabled ? 'Video: ON' : 'Video: OFF';
    this.toggleVideoBtn.classList.toggle('inactive', enabled);
  }

  toggleAudio() {
    if (!this.localStream) return;

    const audioTracks = this.localStream.getAudioTracks();
    const enabled = audioTracks[0]?.enabled || false;

    audioTracks.forEach(track => {
      track.enabled = !enabled;
    });

    this.toggleAudioBtn.textContent = !enabled ? 'Audio: ON' : 'Audio: OFF';
    this.toggleAudioBtn.classList.toggle('inactive', enabled);
  }

  updateStatus(message) {
    this.statusEl.textContent = message;
    console.log('Status:', message);
  }

  updateCallStatus(message) {
    this.callStatusEl.textContent = message;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new GroupVideoCaller();
});
