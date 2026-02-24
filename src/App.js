import React, { useState, useRef } from 'react';
import { Peer } from 'peerjs';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';

// Material UI Components
import {
  Box, Button, TextField, Typography, Paper, Avatar,
  AppBar, Toolbar, Stack, Card, CardActionArea, Divider, Badge
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';

const STORY_POINTS = ['1', '2', '3', '5', '8', '13', '21', '?'];

// ICE Servers Configuration
const customIceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:YOUR_TURN_SERVER_URL:3478',
      username: 'YOUR_TURN_USERNAME',
      credential: 'YOUR_TURN_PASSWORD',
    }
  ]
};

// 1. Color Dictionary
const getCardColor = (point) => {
  const colors = {
    '1':  { bg: '#e3f2fd', border: '#90caf9', text: '#1565c0' },
    '2':  { bg: '#f3e5f5', border: '#ce93d8', text: '#6a1b9a' },
    '3':  { bg: '#e8f5e9', border: '#a5d6a7', text: '#2e7d32' },
    '5':  { bg: '#fff3e0', border: '#ffcc80', text: '#ef6c00' },
    '8':  { bg: '#ffebee', border: '#ef9a9a', text: '#c62828' },
    '13': { bg: '#e0f7fa', border: '#80deea', text: '#00838f' },
    '21': { bg: '#fce4ec', border: '#f48fb1', text: '#ad1457' },
    '?':  { bg: '#f5f5f5', border: '#e0e0e0', text: '#424242' },
  };
  return colors[point] || colors['?'];
};

function App() {
  const { width, height } = useWindowSize();
  const [peer, setPeer] = useState(null);
  const [role, setRole] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [joinId, setJoinId] = useState('');

  const [roomState, setRoomState] = useState({ users: [], revealed: false, triggerConfetti: false });
  const connectionsRef = useRef([]);
  const stateRef = useRef({ users: [], revealed: false, triggerConfetti: false });

  const generateAvatar = (seed) => `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=e2e8f0`;

  // ---------------------------------------------------------
  // HOST LOGIC
  // ---------------------------------------------------------
  const handleCreateRoom = () => {
    if (!userName) return alert("Please enter your name");
    const newPeer = new Peer({ config: customIceConfig });

    newPeer.on('open', (id) => {
      setPeer(newPeer);
      setRoomId(id);
      setRole('host');
      const hostUser = { id, name: userName, avatar: generateAvatar(userName + id), vote: null };
      updateHostState({ users: [hostUser], revealed: false, triggerConfetti: false });
    });

    newPeer.on('connection', (conn) => {
      connectionsRef.current.push(conn);
      conn.on('data', (data) => {
        if (data.type === 'JOIN') {
          const newUser = { id: conn.peer, name: data.name, avatar: data.avatar, vote: null };
          updateHostState({ ...stateRef.current, users: [...stateRef.current.users, newUser] });
        }
        if (data.type === 'VOTE') {
          const updatedUsers = stateRef.current.users.map(u => u.id === conn.peer ? { ...u, vote: data.vote } : u);
          updateHostState({ ...stateRef.current, users: updatedUsers });
        }
      });
      conn.on('close', () => {
        connectionsRef.current = connectionsRef.current.filter(c => c.peer !== conn.peer);
        updateHostState({ ...stateRef.current, users: stateRef.current.users.filter(u => u.id !== conn.peer) });
      });
    });
  };

  const updateHostState = (newState) => {
    stateRef.current = newState;
    setRoomState(newState);
    connectionsRef.current.forEach(conn => conn.send({ type: 'STATE_UPDATE', state: newState }));
  };

  // 2. The Consensus Algorithm
  const hostReveal = () => {
    const users = stateRef.current.users;

    // Check if everyone voted, and nobody voted '?'
    const activeVotes = users.filter(u => u.vote && u.vote !== '?');
    const everyoneVoted = activeVotes.length === users.length && users.length > 0;

    // Check if all votes are exactly the same
    const isConsensus = everyoneVoted && activeVotes.every(u => u.vote === activeVotes[0].vote);

    updateHostState({ ...stateRef.current, revealed: true, triggerConfetti: isConsensus });

    // Only turn off the confetti flag if it was triggered
    if (isConsensus) {
      setTimeout(() => {
        updateHostState({ ...stateRef.current, triggerConfetti: false });
      }, 5000); // 5 seconds of confetti and dancing
    }
  };

  const hostClear = () => updateHostState({ users: stateRef.current.users.map(u => ({ ...u, vote: null })), revealed: false, triggerConfetti: false });

  // ---------------------------------------------------------
  // GUEST LOGIC
  // ---------------------------------------------------------
  const handleJoinRoom = () => {
    if (!userName || !joinId) return alert("Please enter name and Room ID");
    const newPeer = new Peer({ config: customIceConfig });
    setPeer(newPeer);
    setRole('guest');

    newPeer.on('open', () => {
      const conn = newPeer.connect(joinId, { reliable: true });
      connectionsRef.current = [conn];

      conn.on('open', () => {
        conn.send({ type: 'JOIN', name: userName, avatar: generateAvatar(userName + newPeer.id) });
      });

      conn.on('data', (data) => {
        if (data.type === 'STATE_UPDATE') setRoomState(data.state);
      });

      conn.on('close', () => {
        alert("Host disconnected. Room closed.");
        window.location.reload();
      });
    });
  };

  // ---------------------------------------------------------
  // SHARED LOGIC
  // ---------------------------------------------------------
  const castVote = (point) => {
    if (role === 'host') {
      const updatedUsers = stateRef.current.users.map(u => u.id === peer.id ? { ...u, vote: point } : u);
      updateHostState({ ...stateRef.current, users: updatedUsers });
    } else {
      connectionsRef.current[0].send({ type: 'VOTE', vote: point });
      const updatedUsers = roomState.users.map(u => u.id === peer.id ? { ...u, vote: point } : u);
      setRoomState({ ...roomState, users: updatedUsers });
    }
  };

  // ==========================================
  // VIEW: LOBBY
  // ==========================================
  if (!role) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.100' }}>
        <Paper elevation={3} sx={{ p: 5, maxWidth: 400, width: '100%', borderRadius: 3 }}>
          <Typography variant="h4" component="h1" align="center" fontWeight="bold" color="primary" gutterBottom>
            Agile Poker
          </Typography>
          <Typography variant="subtitle1" align="center" color="text.secondary" mb={4}>
            Real-time P2P Estimation
          </Typography>

          <Stack spacing={3}>
            <TextField label="Display Name" variant="outlined" fullWidth placeholder="e.g., Raushan" value={userName} onChange={(e) => setUserName(e.target.value)} />
            <Button variant="contained" size="large" onClick={handleCreateRoom} sx={{ py: 1.5, fontWeight: 'bold' }}>Start New Session</Button>
            <Divider>OR JOIN</Divider>
            <Stack direction="row" spacing={1}>
              <TextField label="Room ID" variant="outlined" fullWidth size="small" value={joinId} onChange={(e) => setJoinId(e.target.value)} />
              <Button variant="outlined" color="success" onClick={handleJoinRoom} sx={{ px: 4, fontWeight: 'bold' }}>Join</Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  }

  // ==========================================
  // VIEW: POKER ROOM
  // ==========================================
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'grey.50' }}>

      {/* 3. INJECT CUSTOM CSS ANIMATIONS */}
      <style>
        {`
          @keyframes victoryDance {
            0% { transform: translateY(0) rotate(0deg) scale(1); }
            25% { transform: translateY(-20px) rotate(-10deg) scale(1.1); }
            50% { transform: translateY(0) rotate(10deg) scale(1.1); }
            75% { transform: translateY(-20px) rotate(-10deg) scale(1.1); }
            100% { transform: translateY(0) rotate(0deg) scale(1); }
          }
          .dancing-avatar {
            animation: victoryDance 1s ease-in-out infinite;
            transform-origin: bottom center;
          }
          @keyframes pulseText {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.05); opacity: 1; }
          }
          .pulsing-banner {
            animation: pulseText 1.5s ease-in-out infinite;
          }
        `}
      </style>

      {/* 4. THE CONFETTI & BANNER OVERLAY */}
      {roomState.triggerConfetti && (
        <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Confetti width={width} height={height} recycle={false} numberOfPieces={600} gravity={0.12} />

          <Paper elevation={12} className="pulsing-banner" sx={{ mt: -30, px: 6, py: 2, bgcolor: 'success.main', color: 'white', borderRadius: 10, border: '4px solid white' }}>
            <Typography variant="h3" fontWeight="900" sx={{ textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>
              🎉 PERFECT CONSENSUS! 🎉
            </Typography>
          </Paper>
        </Box>
      )}

      {/* HEADER */}
      <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'white' }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="h6" color="text.secondary" fontWeight="bold">Room ID:</Typography>
            <Paper variant="outlined" sx={{ px: 2, py: 0.5, bgcolor: 'grey.100', color: 'primary.main', fontWeight: 'bold', userSelect: 'all' }}>
              {role === 'host' ? roomId : joinId}
            </Paper>
          </Stack>

          {role === 'host' && (
            <Stack direction="row" spacing={2}>
              <Button variant="contained" color="primary" startIcon={<VisibilityIcon />} onClick={hostReveal} sx={{ fontWeight: 'bold' }}>Reveal</Button>
              <Button variant="outlined" color="error" startIcon={<DeleteSweepIcon />} onClick={hostClear} sx={{ fontWeight: 'bold' }}>Clear</Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>

      {/* THE MAIN BOARD (THE TABLE) */}
      <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Paper elevation={0} sx={{ width: '100%', maxWidth: 1000, minHeight: 400, bgcolor: 'grey.200', borderRadius: 8, border: '8px solid', borderColor: 'grey.300', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, p: 4 }}>
          {roomState.users.map((user) => {
            // Apply Colors to the Table Cards
            const cardStyle = user.vote ? getCardColor(user.vote) : null;

            return (
              <Stack
                key={user.id}
                alignItems="center"
                spacing={1}
                sx={{ position: 'relative' }}
                // 5. APPLY DANCING CLASS IF TRIGGERED
                className={roomState.triggerConfetti ? 'dancing-avatar' : ''}
              >
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                  badgeContent={
                    <Paper elevation={3} sx={{
                      width: 40, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 1, fontWeight: 'bold', fontSize: '1.2rem',

                      // Dynamic Background
                      bgcolor: roomState.revealed && cardStyle
                        ? cardStyle.bg
                        : (user.vote ? 'primary.main' : 'grey.100'),

                      // Dynamic Text Color
                      color: roomState.revealed && cardStyle
                        ? cardStyle.text
                        : (user.vote ? 'white' : 'grey.400'),

                      // Dynamic Border Color
                      border: '2px solid',
                      borderColor: roomState.revealed && cardStyle
                        ? cardStyle.border
                        : (user.vote ? 'primary.dark' : 'grey.300'),

                      transform: roomState.revealed ? 'translateY(-8px)' : 'none',
                      transition: 'all 0.3s ease'
                    }}>
                      {roomState.revealed ? (user.vote || '-') : (user.vote ? '✓' : '?')}
                    </Paper>
                  }
                >
                  <Avatar src={user.avatar} sx={{ width: 90, height: 90, border: '4px solid white', boxShadow: 2, bgcolor: 'grey.100' }} />
                </Badge>
                <Paper elevation={1} sx={{ px: 2, py: 0.5, borderRadius: 5, mt: 2 }}>
                  <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">{user.name}</Typography>
                </Paper>
              </Stack>
            );
          })}
        </Paper>
      </Box>

      {/* THE VOTING DOCK */}
      <Paper elevation={8} sx={{ p: 3, display: 'flex', justifyContent: 'center', zIndex: 10, borderRadius: '24px 24px 0 0' }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" justifyContent="center" useFlexGap>
          {STORY_POINTS.map(point => {
            const isSelected = roomState.users.find(u => u.id === peer?.id)?.vote === point;

            // Apply Colors to the Hand of Cards
            const cardStyle = getCardColor(point);

            return (
              <Card
                key={point}
                elevation={isSelected ? 6 : 1}
                sx={{
                  width: 60, height: 90,
                  transform: isSelected ? 'translateY(-12px)' : 'none',
                  transition: 'transform 0.2s ease-in-out',
                  border: isSelected ? '2px solid' : '1px solid',

                  borderColor: isSelected ? cardStyle.border : 'grey.300',
                  bgcolor: isSelected ? cardStyle.bg : 'white',

                  overflow: 'visible'
                }}
              >
                <CardActionArea onClick={() => castVote(point)} sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="h5" fontWeight="bold" color={isSelected ? cardStyle.text : 'text.secondary'}>
                    {point}
                  </Typography>
                </CardActionArea>
              </Card>
            )
          })}
        </Stack>
      </Paper>
    </Box>
  );
}

export default App;