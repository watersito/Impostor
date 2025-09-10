import { db } from "./firebase.js";
import { ref, set, get, update, remove, onValue, onDisconnect, child } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js";

const $ = id => document.getElementById(id);
let myPlayerId = getOrCreateUID();
let myName = null;
let currentLobby = null;
let unsubscribeLobby = null;
let cachedLobby = null;

function getOrCreateUID() {
  const key = "impostor_uid_v3";
  let id = localStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

function randomCode() { return Math.random().toString(36).substring(2,6).toUpperCase(); }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// CREAR / UNIRSE A LOBBY
$("createGame").onclick = async () => {
  let nameInput = prompt("Tu nombre (máx. 10 caracteres):")?.trim();
  if (!nameInput) nameInput = "Jugador";
  myName = nameInput.slice(0, 10);
  const code = randomCode();
  await createLobby(code, myName);
  enterLobby(code);
};

$("joinGame").onclick = async () => {
  const code = (prompt("Código:")||"").trim().toUpperCase();
  if (!code) return;
  let nameInput = prompt("Tu nombre (máx. 10 caracteres):")?.trim();
  if (!nameInput) nameInput = "Jugador";
  myName = nameInput.slice(0, 10);
  const ok = await joinLobby(code, myName);
  if (!ok) { alert("Lobby no existe o no se puede unir."); return; }
  enterLobby(code);
};

// CREAR LOBBY
async function createLobby(code, playerName) {
  const lobbyRef = ref(db, "lobbies/" + code);
  const snap = await get(lobbyRef);
  if (snap.exists()) return createLobby(randomCode());
  const player = { id: myPlayerId, name: playerName, isImpostor: false, joinedAt: Date.now() };
  await set(lobbyRef, { 
    hostId: myPlayerId, 
    createdAt: Date.now(), 
    status: "lobby", 
    round: 0, 
    word: "", 
    wordChooser: "",
    players: { [myPlayerId]: player }, 
    votes: {}, 
    results: {} 
  });
  const pRef = ref(db, `lobbies/${code}/players/${myPlayerId}`);
  onDisconnect(pRef).remove();
}

// UNIRSE A LOBBY
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

// ENTRAR AL LOBBY
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

// SALIR DEL LOBBY
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
  currentLobby = null; cachedLobby = null;
  if (unsubscribeLobby) unsubscribeLobby();
  unsubscribeLobby = null;
  $("game").classList.add("hidden");
  $("menu").classList.remove("hidden");
  if (!silent) alert("Has salido del lobby.");
}
async function closeLobby() {
    if(!currentLobby) return;
    const confirmClose = confirm("¿Seguro que quieres cerrar el lobby? Todos los jugadores serán expulsados.");
    if(!confirmClose) return;

    const lobbyRef = ref(db, "lobbies/" + currentLobby);
    await remove(lobbyRef);

    // Salir del lobby localmente
    currentLobby = null;
    cachedLobby = null;

    if (unsubscribeLobby) unsubscribeLobby();
    unsubscribeLobby = null;

    $("game").classList.add("hidden");
    $("menu").classList.remove("hidden");
    alert("Lobby cerrado.");
}


// RENDERIZAR LOBBY
function renderLobby(lobby) {
  const me = lobby.players?.[myPlayerId];
  const isImpostor = !!me?.isImpostor;
if(lobby.status === "playing" || lobby.status === "reveal") {
    $("roleBanner").textContent = isImpostor ? "IMPOSTOR" : "CIUDADANO";
    $("roleBanner").style.color = isImpostor ? "red" : "green";
} else {
    $("roleBanner").textContent = "En el lobby";
    $("roleBanner").style.color = "black";
}  $("secretWord").textContent = (!isImpostor && lobby.word && (lobby.status === "playing" || lobby.status === "reveal")) ? lobby.word : "—";
  if (isImpostor && lobby.status === "playing") $("secretWord").textContent = "No ves la palabra (eres impostor)";

  const players = Object.values(lobby.players || {}).sort((a,b)=>a.joinedAt-b.joinedAt);
  const playersList = $("playersList"); playersList.innerHTML = "";
 players.forEach(p => {
    const el = document.createElement("div");
    let text = p.name;
    if(p.id === lobby.hostId) text += " 🏠"; // Host
    if(p.id === myPlayerId) text += " (tú)";

    // Tachado si el jugador fue eliminado
    if(p.eliminated) el.style.textDecoration = "line-through";

    el.textContent = text;
    // Emoji de calavera al lado si fue eliminado
    if(p.eliminated) el.textContent += " ☠️";
    playersList.appendChild(el);
});

  const buttonsContainer = $("gameButtons");
  buttonsContainer.innerHTML = "";

  // Botón host: empezar partida
const iAmHost = lobby.hostId === myPlayerId;
if (iAmHost && (lobby.status === "lobby" || lobby.status === "reveal")) {    const btn = document.createElement("button");
    btn.textContent = "Empezar partida";
    btn.className = "px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-500";
    btn.onclick = () => hostStartGame(lobby);
    buttonsContainer.appendChild(btn);
// Botón cerrar lobby
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Cerrar lobby";
    closeBtn.className = "px-4 py-2 rounded bg-red-600 text-white hover:bg-red-500 ml-2";
    closeBtn.onclick = () => closeLobby();
    buttonsContainer.appendChild(closeBtn);

  }

  // Botón jugador elegido: escribir palabra
  if(lobby.wordChooser === myPlayerId && lobby.status === "choosingWord") {
    const btn = document.createElement("button");
    btn.textContent = "Escribir palabra secreta";
    btn.className = "px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-500";
    btn.onclick = () => promptWordAndStart(lobby);
    buttonsContainer.appendChild(btn);
  }

  renderVotes(lobby);

  // Mostrar ganador si hay
  if(lobby.status === "reveal") {
    const winner = lobby.winner;
    $("roleBanner").textContent = winner === "ciudadanos" ? "¡Ciudadanos ganan!" : "¡Impostor gana!";

  }
}

// HOST INICIA PARTIDA: se elige jugador aleatorio que escribirá palabra

async function hostStartGame(lobby) {
    const players = Object.values(lobby.players);
    const alivePlayers = players.filter(p => !p.eliminated);
    const chooser = pickRandom(alivePlayers).id;
    const lobbyRef = ref(db, "lobbies/" + currentLobby);
    await update(lobbyRef, { 
        status: "choosingWord", 
        wordChooser: chooser,
        word: "",
        round: 0,
        votes: {},
        results: {},
        winner: ""
    });
    
    // Resetear impostor a false para todos
    const updates = {};
    players.forEach(p => updates[`players/${p.id}/isImpostor`] = false);
    await update(lobbyRef, updates);
}


// JUGADOR ELIGIDO INGRESA PALABRA
async function promptWordAndStart(lobby) {
  const word = prompt("Introduce la palabra secreta:");
  if (!word) return;

  const players = Object.values(lobby.players);
  const impostorCandidate = players.filter(p => p.id !== myPlayerId);
  const impostor = pickRandom(impostorCandidate).id;

  const updates = {};
  players.forEach(p => updates[`players/${p.id}/isImpostor`] = (p.id === impostor));

  const lobbyRef = ref(db, "lobbies/" + currentLobby);
  await update(lobbyRef, {
    status: "playing",
    round: 1,
    word: word,
    ...updates
  });

  await remove(child(lobbyRef, "votes"));
  await remove(child(lobbyRef, "results"));
}

// VOTACIONES
function renderVotes(lobby) {
  const votePanel = $("votePanel"); const whoVoted = $("whoVoted");
  votePanel.innerHTML = ""; whoVoted.innerHTML = "";
  if (lobby.status !== "playing" ) {
    votePanel.textContent = "La votación estará disponible cuando inicie la partida.";
    return;
  }
  const roundKey = String(lobby.round || 1);
  const votes = lobby.votes?.[roundKey] || {};
  const players = Object.values(lobby.players || {}).sort((a,b)=>a.joinedAt-b.joinedAt);
  const title = document.createElement("h3");
  title.textContent = "Elige a quién quieres votar:";
  title.className = "text-lg font-semibold mb-2 text-gray-800";
  votePanel.appendChild(title);
  players.filter(p => !p.eliminated).forEach(p => {
    if(p.id === myPlayerId) return;
    const btn = document.createElement("button");
    btn.className = "block w-auto my-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-400";
    btn.textContent = p.name;
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

// FUNCION VOTAR
async function castVote(targetId) {
  if(!cachedLobby || cachedLobby.status !== "playing") return;
  const roundKey = String(cachedLobby.round || 1);
  const voteRef = ref(db, `lobbies/${currentLobby}/votes/${roundKey}/${myPlayerId}`);
  await set(voteRef, targetId);

  // Revisar si todos han votado
  await checkVotesAndResult();
}

// CHEQUEAR VOTOS Y RESULTADO
async function checkVotesAndResult() {
  if (!cachedLobby) return;
  const lobby = cachedLobby;
  const players = Object.values(lobby.players);
  const roundKey = String(lobby.round || 1);
  const votes = lobby.votes?.[roundKey] || {};

  if(Object.keys(votes).length < players.length) return;

  // Contar votos 
  const voteCounts = {};
  Object.values(votes).forEach(v => voteCounts[v] = (voteCounts[v] || 0) + 1);

  let maxVotes = 0;
  let votedOutId = null;
  Object.entries(voteCounts).forEach(([id,count])=>{
    if(count > maxVotes) {
      maxVotes = count;
      votedOutId = id;
    }
  });

  const impostor = players.find(p => p.isImpostor);
  let result = "";

  if(votedOutId === impostor.id) {
    result = "ciudadanos";
    // alert("¡Los ciudadanos han ganado! El impostor fue eliminado.");
  } else {
    const aliveCitizens = players.filter(p => !p.isImpostor);
    if(aliveCitizens.length -1 <= 1) {
      result = "impostor";
      // alert("¡El impostor ha ganado!");
    } else {
      await update(ref(db, `lobbies/${currentLobby}/players/${votedOutId}`), { eliminated: true });
      await update(ref(db, `lobbies/${currentLobby}`), { round: lobby.round + 1 });
      return;
    }
  }

  await update(ref(db, `lobbies/${currentLobby}`), { status: "reveal", winner: result });
}
