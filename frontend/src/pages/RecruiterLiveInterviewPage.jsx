import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { api, getApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

function RemoteVideo({ stream, name, status }) {
  const video = useRef(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return <div className="relative overflow-hidden rounded-xl bg-slate-950">
    <video ref={video} autoPlay playsInline className="aspect-video w-full object-cover" />
    <p className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-sm text-white">{name || "Interview participant"} · {status}</p>
  </div>;
}

export default function RecruiterLiveInterviewPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [stage, setStage] = useState("setup");
  const [consent, setConsent] = useState(false);
  const [camera, setCamera] = useState(true);
  const [microphone, setMicrophone] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [participants, setParticipants] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [connectionStates, setConnectionStates] = useState({});
  const [canComplete, setCanComplete] = useState(false);
  const localVideo = useRef(null);
  const streamRef = useRef(null);
  const screenRef = useRef(null);
  const socketRef = useRef(null);
  const peers = useRef(new Map());
  const pendingIce = useRef(new Map());
  const iceServers = useRef([]);

  function closeMedia() {
    socketRef.current?.disconnect();
    socketRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    screenRef.current = null;
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    pendingIce.current.clear();
  }

  useEffect(() => () => closeMedia(), []);

  function emitSignal(event, payload) {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected) return reject(new Error("The signaling connection is unavailable."));
      socket.timeout(5000).emit(event, payload, (timeoutError, response) => {
        if (timeoutError) return reject(new Error("The signaling server did not respond."));
        if (response?.ok) return resolve();
        reject(new Error(response?.code || "Signal could not be delivered."));
      });
    });
  }

  function getPeer(remoteId) {
    if (peers.current.has(remoteId)) return peers.current.get(remoteId);
    const peer = new RTCPeerConnection({ iceServers: iceServers.current });
    const stream = streamRef.current;
    if (stream) {
      const screenTrack = screenRef.current?.getVideoTracks()[0];
      stream.getTracks().forEach((track) => {
        peer.addTrack(track.kind === "video" && screenTrack ? screenTrack : track, stream);
      });
    }
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) emitSignal("signal:ice", { to: remoteId, candidate }).catch((signalError) => setError(signalError.message));
    };
    peer.ontrack = ({ streams }) => {
      const [remoteStream] = streams;
      if (remoteStream) setRemoteStreams((current) => ({ ...current, [remoteId]: remoteStream }));
    };
    peer.onconnectionstatechange = () => {
      setConnectionStates((current) => ({ ...current, [remoteId]: peer.connectionState }));
      if (["failed", "closed"].includes(peer.connectionState)) {
        peer.close();
        peers.current.delete(remoteId);
        pendingIce.current.delete(remoteId);
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[remoteId];
          return next;
        });
      }
    };
    peers.current.set(remoteId, peer);
    setConnectionStates((current) => ({ ...current, [remoteId]: "connecting" }));
    return peer;
  }

  async function flushIce(remoteId, peer) {
    const candidates = pendingIce.current.get(remoteId) || [];
    pendingIce.current.delete(remoteId);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }

  async function createOffer(remoteId) {
    if (!user?.id || user.id >= remoteId || peers.current.has(remoteId)) return;
    const peer = getPeer(remoteId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await emitSignal("signal:offer", { to: remoteId, description: peer.localDescription });
  }

  async function onParticipants(ids) {
    const otherIds = ids.filter((participantId) => participantId !== user?.id);
    setParticipants((current) => [...new Set([...current, ...otherIds])]);
    for (const remoteId of otherIds) await createOffer(remoteId);
  }

  async function start() {
    setError("");
    if (!consent) return setError("Please grant camera and microphone consent to continue.");
    if (!navigator.mediaDevices?.getUserMedia) return setError("Your browser does not support secure media devices.");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: camera, audio: microphone });
      streamRef.current = media;
      if (localVideo.current) localVideo.current.srcObject = media;
      const { data: roomResponse } = await api.post(`/interviews/${id}/room`, { consent: true });
      const room = roomResponse.data;
      iceServers.current = room.iceServers || [];
      setCanComplete(room.role === "INTERVIEWER");
      const { data: statusResponse } = await api.get(`/interviews/${id}/room`);
      setParticipants(statusResponse.data.participants
        .filter((participant) => participant.joinedAt && !participant.leftAt && participant.userId !== user?.id)
        .map((participant) => participant.userId));

      const socketOrigin = import.meta.env.VITE_API_SOCKET_URL
        || new URL(import.meta.env.VITE_API_URL || "/api/v1", window.location.origin).origin;
      const socket = io(socketOrigin, {
        path: "/socket.io",
        auth: { token: room.token },
        withCredentials: true,
        autoConnect: false,
      });
      socketRef.current = socket;
      socket.on("connect", () => setStage("live"));
      socket.on("connect_error", (reason) => setError(`Unable to connect to the interview room: ${reason.message}`));
      socket.on("room:error", () => {
        closeMedia();
        setStage("setup");
        setError("This interview room is no longer available.");
      });
      socket.on("room:participants", ({ participantIds }) => onParticipants(participantIds).catch((signalError) => setError(signalError.message)));
      socket.on("participant:joined", ({ participantId }) => onParticipants([participantId]).catch((signalError) => setError(signalError.message)));
      socket.on("participant:left", ({ participantId }) => {
        setParticipants((current) => current.filter((participant) => participant !== participantId));
        peers.current.get(participantId)?.close();
        peers.current.delete(participantId);
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[participantId];
          return next;
        });
      });
      socket.on("room:completed", () => {
        closeMedia();
        setStage("completed");
      });
      socket.on("signal:offer", async ({ from, description }) => {
        try {
          const peer = getPeer(from);
          await peer.setRemoteDescription(description);
          await flushIce(from, peer);
          await peer.setLocalDescription(await peer.createAnswer());
          await emitSignal("signal:answer", { to: from, description: peer.localDescription });
        } catch (signalError) { setError(`Could not establish the peer connection: ${signalError.message}`); }
      });
      socket.on("signal:answer", async ({ from, description }) => {
        try {
          const peer = peers.current.get(from);
          if (!peer) throw new Error("The interview peer connection is no longer available.");
          await peer.setRemoteDescription(description);
          await flushIce(from, peer);
        } catch (signalError) { setError(`Could not complete the peer connection: ${signalError.message}`); }
      });
      socket.on("signal:ice", async ({ from, candidate }) => {
        try {
          if (!candidate) return;
          const peer = getPeer(from);
          if (peer.remoteDescription) await peer.addIceCandidate(candidate);
          else pendingIce.current.set(from, [...(pendingIce.current.get(from) || []), candidate]);
        } catch (signalError) { setError(`Could not add a connection candidate: ${signalError.message}`); }
      });
      socket.connect();
    } catch (requestError) {
      closeMedia();
      setError(getApiError(requestError));
    }
  }

  async function shareScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) return setError("Screen sharing is not available in this browser.");
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenRef.current = screen;
      const track = screen.getVideoTracks()[0];
      const replacements = [...peers.current.values()].map((peer) => {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        return sender?.replaceTrack(track);
      }).filter(Boolean);
      await Promise.all(replacements);
      if (localVideo.current) localVideo.current.srcObject = screen;
      track.onended = () => {
        const cameraTrack = streamRef.current?.getVideoTracks()[0];
        peers.current.forEach((peer) => {
          const sender = peer.getSenders().find((item) => item.track?.kind === "video");
          if (sender && cameraTrack) sender.replaceTrack(cameraTrack).catch(() => setError("Camera video could not be restored."));
        });
        screen.getTracks().forEach((screenTrack) => screenTrack.stop());
        screenRef.current = null;
        if (localVideo.current && streamRef.current) localVideo.current.srcObject = streamRef.current;
        setSharing(false);
      };
      setSharing(true);
    } catch (requestError) {
      if (requestError.name !== "NotAllowedError") setError("Screen sharing could not be started.");
    }
  }

  function toggle(kind) {
    const track = kind === "video" ? streamRef.current?.getVideoTracks()[0] : streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    if (kind === "video") setCamera(track.enabled);
    else setMicrophone(track.enabled);
  }

  function completeInterview() {
    socketRef.current?.emit("room:complete", (response) => {
      if (!response?.ok) {
        setError(response?.code === "FORBIDDEN" ? "Only an assigned interviewer can complete this interview." : "The interview could not be completed.");
        return;
      }
      closeMedia();
      setStage("completed");
    });
  }

  if (stage === "completed" || stage === "left") return <section className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm">
    <h1 className="text-2xl font-bold">{stage === "completed" ? "Interview completed" : "You left the interview"}</h1>
    <p className="mt-2 text-slate-600">This live session is not recorded.</p>
    <Link to={user?.role === "RECRUITER" ? "/recruiter/interviews" : "/student/recruiter-interviews"} className="mt-5 inline-block font-semibold text-indigo-700 underline">Return to interviews</Link>
  </section>;

  return <section className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-sm sm:p-8">
    <h1 className="text-2xl font-bold text-slate-950">Recruiter interview room</h1>
    {stage === "setup" ? <div className="mt-6 space-y-4">
      <p className="text-slate-600">Check your camera and microphone before joining. This interview uses live WebRTC and is not recorded.</p>
      <label className="flex items-start gap-3"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I consent to using my camera and microphone for this interview session.</span></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!consent} onClick={start}>Join interview</button>
    </div> : <div className="mt-6">
      <p role="status" className="mb-3 text-sm text-slate-600">{stage === "live" ? `${participants.length} other participant(s) in the room` : "Connecting to the interview room…"}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl bg-slate-950">
          <video ref={localVideo} autoPlay muted playsInline className="aspect-video w-full object-cover" />
          <p className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-sm text-white">You {sharing ? "· sharing screen" : ""}</p>
        </div>
        {Object.entries(remoteStreams).map(([participantId, stream]) => (
          <RemoteVideo key={participantId} stream={stream} name="Interview participant" status={connectionStates[participantId] || "connecting"} />
        ))}
      </div>
      {participants.length > 0 && !Object.keys(remoteStreams).length && <p className="mt-3 text-sm text-slate-500">Waiting for the other participant’s media connection…</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-lg border px-3 py-2" onClick={() => toggle("video")}>{camera ? "Turn camera off" : "Turn camera on"}</button>
        <button className="rounded-lg border px-3 py-2" onClick={() => toggle("audio")}>{microphone ? "Mute microphone" : "Unmute microphone"}</button>
        <button className="rounded-lg border px-3 py-2" onClick={shareScreen} disabled={sharing}>{sharing ? "Sharing screen" : "Share screen"}</button>
        {canComplete && <button className="rounded-lg border border-red-300 px-3 py-2 text-red-700" onClick={completeInterview}>Complete interview</button>}
        <button className="rounded-lg border px-3 py-2" onClick={() => { closeMedia(); setStage("left"); }}>Leave room</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>}
  </section>;
}
