import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { api, getApiError } from "../lib/api";

export default function RecruiterLiveInterviewPage() {
  const { id } = useParams();
  const [stage, setStage] = useState("setup");
  const [consent, setConsent] = useState(false);
  const [camera, setCamera] = useState(true);
  const [microphone, setMicrophone] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [participants, setParticipants] = useState([]);
  const localVideo = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peers = useRef(new Map());

  useEffect(() => () => {
    socketRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    peers.current.forEach((peer) => peer.close());
  }, []);

  async function start() {
    setError("");
    if (!consent) return setError("Please grant camera and microphone consent to continue.");
    if (!navigator.mediaDevices?.getUserMedia) return setError("Your browser does not support secure media devices.");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: camera, audio: microphone });
      streamRef.current = media;
      if (localVideo.current) localVideo.current.srcObject = media;
      const { data } = await api.post(`/interviews/${id}/room`, { consent: true });
      const socket = io(import.meta.env.VITE_API_SOCKET_URL || window.location.origin, { path: "/socket.io", auth: { token: data.data.token }, withCredentials: true });
      socketRef.current = socket;
      socket.on("connect", () => setStage("live"));
      socket.on("connect_error", (reason) => setError(`Unable to connect to the interview room: ${reason.message}`));
      socket.on("participant:joined", ({ participantId }) => setParticipants((current) => [...new Set([...current, participantId])]));
      socket.on("participant:left", ({ participantId }) => setParticipants((current) => current.filter((item) => item !== participantId)));
      socket.on("room:completed", () => setStage("completed"));
      socket.on("signal:offer", async ({ from, description }) => {
        const peer = getPeer(from);
        await peer.setRemoteDescription(description);
        await peer.setLocalDescription(await peer.createAnswer());
        socket.emit("signal:answer", { to: from, description: peer.localDescription });
      });
      socket.on("signal:answer", async ({ from, description }) => getPeer(from).setRemoteDescription(description));
      socket.on("signal:ice", async ({ from, candidate }) => candidate && getPeer(from).addIceCandidate(candidate));
    } catch (requestError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setError(getApiError(requestError));
    }
  }

  function getPeer(remoteId) {
    if (peers.current.has(remoteId)) return peers.current.get(remoteId);
    const peer = new RTCPeerConnection({ iceServers: [] });
    streamRef.current?.getTracks().forEach((track) => peer.addTrack(track, streamRef.current));
    peer.onicecandidate = ({ candidate }) => candidate && socketRef.current?.emit("signal:ice", { to: remoteId, candidate });
    peers.current.set(remoteId, peer);
    return peer;
  }

  async function shareScreen() {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const sender = [...peers.current.values()].flatMap((peer) => peer.getSenders()).find((item) => item.track?.kind === "video");
      if (sender) sender.replaceTrack(screen.getVideoTracks()[0]);
      screen.getVideoTracks()[0].onended = () => { const cameraTrack = streamRef.current?.getVideoTracks()[0]; if (cameraTrack && sender) sender.replaceTrack(cameraTrack); setSharing(false); };
      setSharing(true);
    } catch (requestError) { if (requestError.name !== "NotAllowedError") setError("Screen sharing could not be started."); }
  }

  function toggle(kind) {
    const track = kind === "video" ? streamRef.current?.getVideoTracks()[0] : streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    kind === "video" ? setCamera(track.enabled) : setMicrophone(track.enabled);
  }

  if (stage === "completed") return <section className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold">Interview completed</h1><p className="mt-2 text-slate-600">The live room has been closed. No audio or video was recorded.</p></section>;
  return <section className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-sm">
    <h1 className="text-2xl font-bold text-slate-950">Recruiter interview room</h1>
    {stage === "setup" ? <div className="mt-6 space-y-4">
      <p className="text-slate-600">Check your camera and microphone before joining. This interview uses live WebRTC and is not recorded.</p>
      <label className="flex items-start gap-3"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I consent to using my camera and microphone for this interview session.</span></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!consent} onClick={start}>Join interview</button>
    </div> : <div className="mt-6">
      <video ref={localVideo} autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-slate-950 object-cover" />
      <p className="mt-3 text-sm text-slate-500">{participants.length} participant(s) connected</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-lg border px-3 py-2" onClick={() => toggle("video")}>{camera ? "Turn camera off" : "Turn camera on"}</button>
        <button className="rounded-lg border px-3 py-2" onClick={() => toggle("audio")}>{microphone ? "Mute microphone" : "Unmute microphone"}</button>
        <button className="rounded-lg border px-3 py-2" onClick={shareScreen} disabled={sharing}>{sharing ? "Sharing screen" : "Share screen"}</button>
        <button className="rounded-lg border border-red-300 px-3 py-2 text-red-700" onClick={() => socketRef.current?.emit("room:complete", () => setStage("completed"))}>Complete interview</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>}
  </section>;
}
