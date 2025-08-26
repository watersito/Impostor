import { db } from "./firebase.js";
import { ref, set, get, update, remove, onValue, onDisconnect, child } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js";

const $ = id => document.getElementById(id);
let myPlayerId = getOrCreateUID();
let myName = null;
let currentLobby = null;
let isHost = false;
let unsubscribeLobby = null;
let cachedLobby = null;

function getOrCreateUID() {
  const key = "impostor_uid_v1";
  let id = localStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

function randomCode() { return Math.random().toString(36).substring(2,6).toUpperCase(); }

$("createGame").onclick = async () => {
  myName = prompt("Tu nombre:") || "Jugador";
  const code = randomCode();
  isHost = true;
  await createLobby(code, myName);
  enterLobby(code);
};

$("joinGame").onclick = async () => {
  const code = (prompt("Código:")||"").trim().toUpperCase();
  if (!code) return;
  myName = prompt("Tu nombre:") || "Jugador";
  isHost = false;
  const ok = await joinLobby(code, myName);
  if (!ok) { alert("Lobby no existe o no se puede unir."); return; }
  enterLobby(code);
};

async function createLobby(code, playerName) {
  const lobbyRef = ref(db, "lobbies/" + code);
  const snap = await get(lobbyRef);
  if (snap.exists()) return createLobby(randomCode());
  const player = { id: myPlayerId, name: playerName, isImpostor: false, joinedAt: Date.now() };
  await set(lobbyRef, { hostId: myPlayerId, createdAt: Date.now(), status: "lobby", round: 0, word: "", players: { [myPlayerId]: player }, votes: {}, results: {} });
  const pRef = ref(db, `lobbies/${code}/players/${myPlayerId}`);
  onDisconnect(pRef).remove();
  return true;
}

async function joinLobby(code, playerName) {
  const lobbyRef = ref(db, "lobbies/" + code);
  const snap = await get(lobbyRef);
  if (!snap.exists()) return false;
  const lobby = snap.val();
  if (lobby.status !== "lobby") return false;
  const playerRef = ref(db, `lobbies/${code}/players/${myPlayerId}`);
  await set(playerRef, { id: myPlayerId, name: playerName, isImpostor: false, joinedAt: Date.now() });
  onDisconnect(playerRef).remove();
  return true;
}

function enterLobby(code) {
  currentLobby = code;
  $("menu").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("lobbyCode").textContent = code;
  if (unsubscribeLobby) unsubscribeLobby();
  const lobbyRef = ref(db, "lobbies/" + code);
  unsubscribeLobby = onValue(lobbyRef, (snap) => {
    if (!snap.exists()) { alert("Lobby eliminado"); return leaveLobby(true); }
    const lobby = snap.val(); cachedLobby = lobby; renderLobby(lobby);
  });
}

async function leaveLobby(silent=false) {
  if (!currentLobby) return;
  const playerRef = ref(db, `lobbies/${currentLobby}/players/${myPlayerId}`);
  await remove(playerRef).catch(()=>{});
  try {
    const lobbyRef = ref(db, "lobbies/" + currentLobby);
    const snap = await get(lobbyRef);
    if (snap.exists()) {
      const lobby = snap.val();
      const players = lobby.players ? Object.keys(lobby.players) : [];
      if (players.length === 0) await remove(lobbyRef);
      else if (lobby.hostId === myPlayerId) {
        const newHost = players[0];
        await update(lobbyRef, { hostId: newHost });
      }
    }
  } catch {}
  currentLobby = null; isHost = false; cachedLobby = null;
  if (unsubscribeLobby) unsubscribeLobby();
  unsubscribeLobby = null;
  $("game").classList.add("hidden");
  $("menu").classList.remove("hidden");
  if (!silent) alert("Has salido del lobby.");
}

function renderLobby(lobby) {
  $("statusLabel").textContent = lobby.status;
  const me = lobby.players?.[myPlayerId];
  const isImpostor = !!me?.isImpostor;
  $("roleBanner").textContent = (lobby.status === "playing" || lobby.status === "reveal") ? (isImpostor ? "IMPOSTOR" : "CIUDADANO") : "En el lobby";
  $("secretWord").textContent = (!isImpostor && lobby.word && (lobby.status === "playing" || lobby.status === "reveal")) ? lobby.word : "—";
  if (isImpostor && lobby.status === "playing") $("secretWord").textContent = "No ves la palabra (eres impostor)";
  const players = Object.values(lobby.players || {}).sort((a,b)=>a.joinedAt-b.joinedAt);
  const playersList = $("playersList"); playersList.innerHTML = "";
  players.forEach(p => {
    const el = document.createElement("div");
    el.textContent = p.name + (p.id===myPlayerId ? " (tú)" : "");
    playersList.appendChild(el);
  });
  renderVotes(lobby);
}

function renderVotes(lobby) {
  const votePanel = $("votePanel"); const whoVoted = $("whoVoted");
  votePanel.innerHTML = ""; whoVoted.innerHTML = "";
  if (lobby.status !== "playing") {
    votePanel.textContent = "La votación estará disponible cuando inicie la partida.";
    return;
  }
  const roundKey = String(lobby.round || 1);
  const votes = (lobby.votes && lobby.votes[roundKey]) ? lobby.votes[roundKey] : {};
  const players = Object.values(lobby.players || {}).sort((a,b)=>a.joinedAt-b.joinedAt);
  players.forEach(p => {
    if (p.id === myPlayerId) return;
    const btn = document.createElement("button");
    btn.textContent = "Votar a " + p.name;
    btn.disabled = !!votes[myPlayerId];
    btn.onclick = () => castVote(p.id);
    votePanel.appendChild(btn);
  });
  const votedPairs = Object.entries(votes).map(([voterId, targetId]) => {
    const voter = lobby.players?.[voterId]?.name || voterId.slice(0,6);
    const target = lobby.players?.[targetId]?.name || targetId.slice(0,6);
    return `• ${voter} → ${target}`;
  });
  whoVoted.innerHTML = votedPairs.length ? votedPairs.join("<br>") : "Nadie ha votado aún.";
}

async function castVote(targetId) {
  if (!cachedLobby || cachedLobby.status !== "playing") return;
  const roundKey = String(cachedLobby.round || 1);
  const voteRef = ref(db, `lobbies/${currentLobby}/votes/${roundKey}/${myPlayerId}`);
  await set(voteRef, targetId);
}

async function startGame(word) {
  const lobbyRef = ref(db, "lobbies/" + currentLobby);
  const snap = await get(lobbyRef);
  if (!snap.exists()) return;
  const lobby = snap.val();
  const players = Object.values(lobby.players || {});
  if (players.length < 3) alert("Se recomiendan al menos 3 jugadores.");
  const impostor = pickRandom(players).id;
  await update(lobbyRef, { status: "playing", round: 1, word: word });
  const updates = {}; players.forEach(p => updates[`players/${p.id}/isImpostor`] = (p.id === impostor));
  await update(lobbyRef, updates);
  try { await remove(child(lobbyRef, "votes")); } catch(e){}
  try { await remove(child(lobbyRef, "results")); } catch(e){}
}

function pickRandom(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

async function closeVoting() {
  const lobbyRef = ref(db, "lobbies/" + currentLobby);
  const snap = await get(lobbyRef);
  if (!snap.exists()) return;
  const lobby = snap.val();
  if (lobby.status !== "playing") return;
  const round = lobby.round || 1; const roundKey = String(round);
  const votes = (lobby.votes && lobby.votes[roundKey]) ? lobby.votes[roundKey] : {};
  const players = lobby.players || {}; const impostorId = Object.values(players).find(p => p.isImpostor)?.id;
  const tally = {}; Object.values(players).forEach(p => tally[p.id]=0); Object.values(votes).forEach(target => { if (tally[target]!==undefined) tally[target]+=1; });
  let maxCount=-1, maxIds=[];
  for (const [pid,count] of Object.entries(tally)) {
    if (count>maxCount) { maxCount=count; maxIds=[pid]; }
    else if (count===maxCount) maxIds.push(pid);
  }
  const impostorHasStrictMax = (maxIds.length===1 && maxIds[0]===impostorId);
  const resultsUpdate = {}; resultsUpdate[`results/${roundKey}`] = { tally, eliminatedUid:(maxIds.length===1?maxIds[0]:null), impostorFound:impostorHasStrictMax, at:Date.now() };
  if (impostorHasStrictMax) { await update(lobbyRef, { status: "reveal", ...resultsUpdate }); alert("¡El impostor fue descubierto!"); }
  else { await update(lobbyRef, { ...resultsUpdate, round: round+1 }); }
}

