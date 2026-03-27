function buildIceServers() {
  const servers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USER || "",
      credential: import.meta.env.VITE_TURN_PASS || "",
    });
  }
  return servers;
}

export function createPeerConnection({ onTrack, onIceCandidate, onStateChange }) {
  const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
  pc.ontrack = (ev) => onTrack(ev);
  pc.onicecandidate = (ev) => {
    if (ev.candidate) onIceCandidate(ev.candidate);
  };
  pc.onconnectionstatechange = () => onStateChange(pc.connectionState);
  pc.oniceconnectionstatechange = () => onStateChange(pc.iceConnectionState);
  return pc;
}

export async function getLocalStream(constraints) {
  return navigator.mediaDevices.getUserMedia(
    constraints || { video: true, audio: true },
  );
}

export function addStreamToPc(pc, stream) {
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }
}

export async function createOffer(pc) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

export async function handleOffer(pc, offer) {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

export async function handleAnswer(pc, answer) {
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

export async function addIceCandidate(pc, candidate) {
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {
    /* late candidates after close — ignore */
  }
}

export function toggleTrack(stream, kind) {
  const track = stream.getTracks().find((t) => t.kind === kind);
  if (!track) return false;
  track.enabled = !track.enabled;
  return track.enabled;
}

export function stopAllTracks(stream) {
  if (!stream) return;
  for (const t of stream.getTracks()) {
    t.stop();
  }
}
