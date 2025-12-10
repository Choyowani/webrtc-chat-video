// websocket 연결
const ws = new WebSocket("ws://localhost:8080");

let pc = null;
let dataChannel = null;
let localStream = null;
let isOfferer = false;

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const chatBox = document.getElementById("chat");
const roomDisplay = document.getElementById("roomDisplay");
const status = document.getElementById("status");

// --------------------------------------
// 방 참여
// --------------------------------------
function joinRoom() {
  const room = document.getElementById("roomInput").value.trim();
  if (!room) return alert("방번호 입력!");

  roomDisplay.textContent = room;
  ws.send(JSON.stringify({ type: "join", room }));
  status.textContent = "입장 중...";
}

// --------------------------------------
// WebSocket onmessage
// Blob → JSON 자동 처리
// --------------------------------------
ws.onmessage = async (event) => {
  let raw = event.data;

  if (raw instanceof Blob) raw = await raw.text();

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    console.error("파싱 실패:", raw);
    return;
  }

  // 방 입장
  if (msg.type === "joined") {
    document.getElementById("roomInputArea").style.display = "none";
    document.getElementById("callArea").style.display = "block";

    status.textContent =
      msg.count === 1 ? "상대 기다리는 중..." : "상대 도착! 연결 중...";
  }

  if (msg.type === "full") {
    alert("방이 꽉 찼습니다.");
    return location.reload();
  }

  // 첫 사람을 Offerer로 지정
  if (msg.type === "start-offer") {
    isOfferer = true;
    await startCall();
    await createOffer();
  }

  // Offer 수신 → Answer
  if (msg.type === "offer") {
    isOfferer = false;
    await startCall();

    await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: "answer", answer }));
  }

  // Answer 수신
  if (msg.type === "answer") {
    await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
  }

  // ICE 처리
  if (msg.type === "ice" && pc) {
    pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  }

  if (msg.type === "partner-left") {
    status.textContent = "상대가 나갔습니다.";
  }
};

// --------------------------------------
// WebRTC 연결 시작
// --------------------------------------
async function startCall() {
  if (pc) return;

  // 카메라 없는 경우 대비
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
  } catch {
    localStream = new MediaStream(); // 빈 스트림
    console.warn("카메라 없음 → 빈 스트림 사용");
  }

  pc = new RTCPeerConnection(config);

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
    status.textContent = "연결됨!";
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
    }
  };

  // Answerer: ondatachannel 먼저 설정
  pc.ondatachannel = (e) => {
    setupDataChannel(e.channel);
  };

  // Offerer: 직접 생성
  if (isOfferer) {
    const channel = pc.createDataChannel("chat");
    setupDataChannel(channel);
  }
}

// --------------------------------------
// Offer 생성
// --------------------------------------
async function createOffer() {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", offer }));
}

// --------------------------------------
// DataChannel 이벤트 설정
// --------------------------------------
function setupDataChannel(channel) {
  channel.onopen = () => {
    console.log("💬 DataChannel OPEN");
    dataChannel = channel;
    status.textContent = "채팅 가능!";
  };

  channel.onmessage = (e) => {
    addChat("상대", e.data);
  };
}

// --------------------------------------
// 채팅 전송
// --------------------------------------
function sendMessage() {
  const msg = document.getElementById("msgInput").value.trim();
  if (!msg) return;

  if (!dataChannel || dataChannel.readyState !== "open") {
    return alert("아직 채팅 연결이 준비되지 않았습니다!");
  }

  dataChannel.send(msg);
  addChat("나", msg);

  document.getElementById("msgInput").value = "";
}

// --------------------------------------
// 채팅 UI
// --------------------------------------
function addChat(sender, text) {
  const div = document.createElement("div");
  div.className = sender === "나" ? "me" : "other";
  div.innerHTML = `<b>${sender}:</b> ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
