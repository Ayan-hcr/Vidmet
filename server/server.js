import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all interfaces for Replit/cloud deployment

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Store connected clients
const clients = new Map();
// Store active call groups: callId -> Set of participantIds
const callGroups = new Map();

wss.on('connection', (ws) => {
  console.log('New client connected');
  let clientId = null;
  let currentCallId = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'register':
          clientId = message.id;
          clients.set(clientId, ws);
          console.log(`Client registered: ${clientId}`);
          break;

        case 'create-call':
          // Create a new call group
          currentCallId = `call-${Date.now()}`;
          callGroups.set(currentCallId, new Set([clientId]));
          ws.send(JSON.stringify({
            type: 'call-created',
            callId: currentCallId
          }));
          console.log(`Call created: ${currentCallId}`);
          break;

        case 'join-call':
          // Join an existing call
          currentCallId = message.callId;
          if (callGroups.has(currentCallId)) {
            callGroups.get(currentCallId).add(clientId);
            
            // Notify all participants that a new peer joined
            const participants = Array.from(callGroups.get(currentCallId));
            callGroups.get(currentCallId).forEach(peerId => {
              if (clients.has(peerId)) {
                clients.get(peerId).send(JSON.stringify({
                  type: 'peer-joined',
                  peerId: clientId,
                  callId: currentCallId,
                  allPeers: participants
                }));
              }
            });
            console.log(`${clientId} joined call ${currentCallId}`);
          }
          break;

        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // Forward signaling messages to the target peer(s)
          if (message.target && clients.has(message.target)) {
            const targetWs = clients.get(message.target);
            targetWs.send(JSON.stringify({
              type: message.type,
              from: clientId,
              data: message.data
            }));
          }
          break;

        case 'get-peers':
          // Return list of available peers (not in a call)
          const allPeers = Array.from(clients.keys()).filter(id => id !== clientId);
          ws.send(JSON.stringify({
            type: 'peers-list',
            peers: allPeers
          }));
          break;

        case 'get-call-participants':
          // Get current call participants
          if (currentCallId && callGroups.has(currentCallId)) {
            const participants = Array.from(callGroups.get(currentCallId));
            ws.send(JSON.stringify({
              type: 'call-participants',
              callId: currentCallId,
              participants
            }));
          }
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (clientId) {
      clients.delete(clientId);
      console.log(`Client disconnected: ${clientId}`);
      
      // Remove from call group if in one
      if (currentCallId && callGroups.has(currentCallId)) {
        const participants = callGroups.get(currentCallId);
        participants.delete(clientId);
        
        // Notify remaining participants
        participants.forEach((peerId) => {
          if (clients.has(peerId)) {
            clients.get(peerId).send(JSON.stringify({
              type: 'peer-left',
              peerId: clientId,
              callId: currentCallId
            }));
          }
        });
        
        // Remove call if empty
        if (participants.size === 0) {
          callGroups.delete(currentCallId);
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Video calling server running on http://0.0.0.0:${PORT}`);
  console.log(`Access at http://localhost:${PORT}`);
});
