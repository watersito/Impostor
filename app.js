import { db } from "./firebase.js";
import { ref, set, get, update, remove, onValue, onDisconnect, child } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";


const $ = id => document.getElementById(id);
const auth = getAuth();
let myPlayerId = null;

signInAnonymously(auth).catch(err => console.error(err));

onAuthStateChanged(auth, (user) => {
  if (user) {
    myPlayerId = user.uid;
  }
});
let myName = null;
let currentLobby = null;
let unsubscribeLobby = null;
let cachedLobby = null;



function randomCode() { return Math.random().toString(36).substring(2, 6).toUpperCase(); }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// MODAL HELPER
function promptModal(title, needsCode = false, defaultCode = "") {
  return new Promise((resolve) => {
    const modal = $("authModal");
    const titleEl = $("modalTitle");
    const nameInput = $("modalNameInput");
    const codeInput = $("modalCodeInput");
    const cancelBtn = $("modalCancelBtn");
    const confirmBtn = $("modalConfirmBtn");

    titleEl.textContent = title;
    modal.classList.remove("hidden");
    nameInput.value = "";

    if (needsCode) {
      codeInput.classList.remove("hidden");
      codeInput.value = defaultCode || ""; // Pre-fill code
    } else {
      codeInput.classList.add("hidden");
    }

    // Focus hack
    setTimeout(() => nameInput.focus(), 50);

    const close = (val) => {
      modal.classList.add("hidden");
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      resolve(val);
    };

    cancelBtn.onclick = () => close(null);
    confirmBtn.onclick = () => {
      const name = nameInput.value.trim();
      const code = needsCode ? codeInput.value.trim().toUpperCase() : null;

      if (!name) { alert("El nombre no puede estar vacío"); return; }
      if (needsCode && !code) { alert("El código es necesario"); return; }

      close({ name, code });
    };
  });
}

// CREAR / UNIRSE A LOBBY
$("createGame").onclick = async () => {
  const result = await promptModal("Crear Partida");
  if (!result) return; // Cancelado

  myName = result.name.slice(0, 10);
  const code = randomCode();
  await createLobby(code, myName);
  enterLobby(code);
};

$("joinGame").onclick = async () => {
  const result = await promptModal("Unirse a Partida", true);
  if (!result) return;

  myName = result.name.slice(0, 10);
  const code = result.code;
  const ok = await joinLobby(code, myName);
  if (!ok) { alert("Lobby no existe o no se puede unir."); return; }
  enterLobby(code);
};

// CHECK URL PARAMS
window.onload = () => {
  const params = new URLSearchParams(window.location.search);
  const lobbyCode = params.get("lobby");
  if (lobbyCode) {
    // Auto-click join and pre-fill
    // We can't auto-join without name, so just open modal
    // But promptModal is async. We handle it here.
    promptModal("Unirse con Invitación", true, lobbyCode).then(async (result) => {
      if (!result) return;
      myName = result.name.slice(0, 10);
      const code = result.code;
      const ok = await joinLobby(code, myName);
      if (!ok) { alert("Lobby no existe o no se puede unir."); return; }
      enterLobby(code);
    });
  }
}

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
    hint: "",
    wordChooser: "",
    settings: { impostorCount: 1, useHint: false },
    players: { [myPlayerId]: player },
    votes: {},
    results: {}
  });
  const pRef = ref(db, `lobbies/${code}/players/${myPlayerId}`);
  onDisconnect(pRef).update({ connected: false });
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
  onDisconnect(playerRef).update({ connected: false });
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
  const playerRef = ref(db, `lobbies/${code}/players/${myPlayerId}`);
  update(playerRef, { connected: true });

  // Share Button
  const shareBtn = $("shareBtn");
  if (shareBtn) {
    shareBtn.onclick = () => {
      const url = `${window.location.origin}${window.location.pathname}?lobby=${code}`;

      // Función auxiliar para feedback
      const showFeedback = () => {
        const originalText = shareBtn.innerHTML;
        shareBtn.innerHTML = "<span>✅</span> Copiado!";
        setTimeout(() => shareBtn.innerHTML = originalText, 2000);
      };

      // Intentar primero API moderna
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(showFeedback)
          .catch(() => fallbackCopy(url, showFeedback));
      } else {
        fallbackCopy(url, showFeedback);
      }
    };
  }
}

function fallbackCopy(text, onSuccess) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed"; // Evitar scroll
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) onSuccess();
    else prompt("Copia este enlace manualmante:", text);
  } catch (err) {
    prompt("Copia este enlace manualmante:", text);
  }

  document.body.removeChild(textArea);
}

// SALIR DEL LOBBY
async function leaveLobby(silent = false) {
  if (!currentLobby) return;
  const playerRef = ref(db, `lobbies/${currentLobby}/players/${myPlayerId}`);
  await remove(playerRef).catch(() => { });
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
  } catch { }
  currentLobby = null; cachedLobby = null;
  if (unsubscribeLobby) unsubscribeLobby();
  unsubscribeLobby = null;
  $("game").classList.add("hidden");
  $("menu").classList.remove("hidden");
  if (!silent) alert("Has salido del lobby.");
}
async function closeLobby() {
  if (!currentLobby) return;
  const confirmClose = confirm("¿Seguro que quieres cerrar el lobby? Todos los jugadores serán expulsados.");
  if (!confirmClose) return;

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

async function updateSettings(code, newSettings) {
  const lobbyRef = ref(db, "lobbies/" + code + "/settings");
  await update(lobbyRef, newSettings);
}


// RENDERIZAR LOBBY
function renderLobby(lobby) {
  const me = lobby.players?.[myPlayerId];
  const isImpostor = !!me?.isImpostor;
  const iAmHost = lobby.hostId === myPlayerId;

  // Manejo de Configuración
  const settingsDiv = $("lobbySettings");
  const impSelect = $("settingImpostorCount");
  const hintCheck = $("settingUseHint");

  if (lobby.status === "lobby") {
    settingsDiv.classList.remove("hidden");
    // Evitar sobrescribir si el usuario está interactuando activamente podría ser complejo,
    // pero aquí asumimos actualización directa.
    if (document.activeElement !== impSelect) impSelect.value = lobby.settings?.impostorCount || 1;
    if (document.activeElement !== hintCheck) hintCheck.checked = !!lobby.settings?.useHint;

    if (iAmHost) {
      impSelect.disabled = false;
      hintCheck.disabled = false;
      impSelect.onchange = () => updateSettings(currentLobby, { impostorCount: parseInt(impSelect.value) });
      hintCheck.onchange = () => updateSettings(currentLobby, { useHint: hintCheck.checked });
    } else {
      impSelect.disabled = true;
      hintCheck.disabled = true;
    }
  } else {
    settingsDiv.classList.add("hidden");
  }


  if (lobby.status === "playing" || lobby.status === "reveal") {
    const roleText = isImpostor ? "IMPOSTOR" : "CIUDADANO";
    $("roleBanner").textContent = roleText;
    $("roleBanner").style.color = isImpostor ? "#ef4444" : "#10b981"; // red-500 : emerald-500
    $("secretWord").style.color = isImpostor ? "#ef4444" : "#10b981";
  } else {
    $("roleBanner").textContent = "En el lobby";
    $("roleBanner").style.color = "white";
    $("secretWord").style.color = "white";
  }

  // Mostrar Palabra y Pista
  const showWord = (!isImpostor && lobby.word && (lobby.status === "playing" || lobby.status === "reveal"));
  $("secretWord").textContent = showWord ? lobby.word : "—";

  if (isImpostor && lobby.status === "playing") {
    $("secretWord").textContent = "No ves la palabra (eres impostor)";
  }

  // Render Hint
  const hintContainer = $("hintContainer");
  const secretHint = $("secretHint");
  if ((lobby.status === "playing" || lobby.status === "reveal") && lobby.hint) {
    hintContainer.classList.remove("hidden");
    secretHint.textContent = lobby.hint;
  } else {
    hintContainer.classList.add("hidden");
    secretHint.textContent = "";
  }

  const players = Object.values(lobby.players || {}).sort((a, b) => a.joinedAt - b.joinedAt);
  const playersList = $("playersList"); playersList.innerHTML = "";
  players.forEach(p => {
    const el = document.createElement("div");
    let text = p.name;
    if (p.id === lobby.hostId) text += " 🏠"; // Host
    if (p.id === myPlayerId) text += " (tú)";

    // Tachado si el jugador fue eliminado
    if (p.eliminated) el.style.textDecoration = "line-through";

    el.textContent = text;
    // Emoji de calavera al lado si fue eliminado
    if (p.eliminated) el.textContent += " ☠️";
    playersList.appendChild(el);
  });

  const buttonsContainer = $("gameButtons");
  buttonsContainer.innerHTML = "";

  // Botón host: empezar partida
  if (iAmHost && (lobby.status === "lobby" || lobby.status === "reveal")) {
    const btn = document.createElement("button");
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
  if (lobby.wordChooser === myPlayerId && lobby.status === "choosingWord") {
    const btn = document.createElement("button");
    btn.textContent = "Escribir palabra secreta";
    btn.className = "px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-500";
    btn.onclick = () => promptWordAndStart(lobby);
    buttonsContainer.appendChild(btn);
  }

  renderVotes(lobby);

  // Mostrar ganador si hay
  if (lobby.status === "reveal") {
    const winner = lobby.winner;
    $("roleBanner").textContent = winner === "ciudadanos" ? "¡Ciudadanos ganan!" : "¡Impostor gana!";

  }
}

// HOST INICIA PARTIDA: se elige jugador aleatorio que escribirá palabra

async function hostStartGame(lobby) {
  const players = Object.values(lobby.players);
  // Para nueva partida, todos juegan (no solo los que sobrevivieron)
  const chooser = pickRandom(players).id;

  const lobbyRef = ref(db, "lobbies/" + currentLobby);
  await update(lobbyRef, {
    status: "choosingWord",
    wordChooser: chooser,
    word: "",
    hint: "",
    round: 0,
    votes: {},
    results: {},
    winner: ""
  });

  // Resetear estado de jugadores (impostor y eliminado)
  const updates = {};
  players.forEach(p => {
    updates[`players/${p.id}/isImpostor`] = false;
    updates[`players/${p.id}/eliminated`] = false; // Resetear muerte
  });
  await update(lobbyRef, updates);
}


// JUGADOR ELIGIDO INGRESA PALABRA
async function promptWordAndStart(lobby) {
  const word = prompt("Introduce la palabra secreta (NO la pista):");
  if (!word) return;

  let hint = "";
  if (lobby.settings?.useHint) {
    hint = prompt("Introduce una Pista para todos (incluida la palabra secreta si quieres, o algo relacionado):");
    if (!hint) hint = "Sin pista";
  }

  const players = Object.values(lobby.players);
  const candidates = players.filter(p => p.id !== myPlayerId); // Excluir al que elige la palabra

  // Determinar número de impostores
  let count = lobby.settings?.impostorCount || 1;
  // Asegurar que no haya más impostores que candidatos posibles (aunque candidates.length debería ser suficiente)
  if (count > candidates.length) count = candidates.length;
  if (count < 1) count = 1;

  // Mezclar array y tomar N
  const shuffled = candidates.sort(() => 0.5 - Math.random());
  const selectedImpostors = shuffled.slice(0, count).map(p => p.id);

  const updates = {};
  players.forEach(p => {
    updates[`players/${p.id}/isImpostor`] = selectedImpostors.includes(p.id);
  });

  const lobbyRef = ref(db, "lobbies/" + currentLobby);
  await update(lobbyRef, {
    status: "playing",
    round: 1,
    word: word,
    hint: hint,
    ...updates
  });

  await remove(child(lobbyRef, "votes"));
  await remove(child(lobbyRef, "results"));
}

// VOTACIONES
function renderVotes(lobby) {
  const votePanel = $("votePanel"); const whoVoted = $("whoVoted");
  votePanel.innerHTML = ""; whoVoted.innerHTML = "";
  if (lobby.status !== "playing") {
    votePanel.textContent = "La votación estará disponible cuando inicie la partida.";
    return;
  }
  const roundKey = String(lobby.round || 1);
  const votes = lobby.votes?.[roundKey] || {};
  const players = Object.values(lobby.players || {}).sort((a, b) => a.joinedAt - b.joinedAt);
  const title = document.createElement("h3");
  title.textContent = "Elige a quién quieres votar:";
  title.className = "text-lg font-semibold mb-2 text-gray-800";
  votePanel.appendChild(title);
  players.filter(p => !p.eliminated).forEach(p => {
    if (p.id === myPlayerId) return;
    const btn = document.createElement("button");
    btn.className = "block w-auto my-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-400";
    btn.textContent = p.name;
    btn.disabled = !!votes[myPlayerId];
    btn.onclick = () => castVote(p.id);
    votePanel.appendChild(btn);
  });
  const votedPairs = Object.entries(votes).map(([voterId, targetId]) => {
    const voter = lobby.players?.[voterId]?.name || voterId.slice(0, 6);
    const target = lobby.players?.[targetId]?.name || targetId.slice(0, 6);
    return `• ${voter} → ${target}`;
  });
  whoVoted.innerHTML = votedPairs.length ? votedPairs.join("<br>") : "Nadie ha votado aún.";
}

// FUNCION VOTAR
async function castVote(targetId) {
  if (!cachedLobby || cachedLobby.status !== "playing") return;
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

  if (Object.keys(votes).length < players.length) return;

  // Contar votos 
  const voteCounts = {};
  Object.values(votes).forEach(v => voteCounts[v] = (voteCounts[v] || 0) + 1);

  let maxVotes = 0;
  let votedOutId = null;
  // En caso de empate, simple: el primero que encuentre (podría mejorarse)
  Object.entries(voteCounts).forEach(([id, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      votedOutId = id;
    }
  });

  // Eliminar al votado
  await update(ref(db, `lobbies/${currentLobby}/players/${votedOutId}`), { eliminated: true });

  // Recalcular estado para ver si alguien gana
  // Nota: players aquí es el snapshot viejo, mejor si tuviéramos el nuevo.
  // Pero podemos simular la eliminación localmente para comprobar condición de victoria.
  const updatedPlayers = players.map(p => {
    if (p.id === votedOutId) return { ...p, eliminated: true };
    return p;
  });

  const impostorsAlive = updatedPlayers.filter(p => p.isImpostor && !p.eliminated).length;
  const citizensAlive = updatedPlayers.filter(p => !p.isImpostor && !p.eliminated).length;

  let result = "";

  if (impostorsAlive === 0) {
    result = "ciudadanos";
  } else if (impostorsAlive >= citizensAlive) {
    result = "impostors"; // Impostores ganan si igualan o superan en número (regla común Among Us)
    // Ojo: En este juego de palabras, a veces la regla es distinta.
    // El usuario dijo: "If the impostor survives until only 1 normal player is left, the impostor wins."
    // Eso implica 1 impostor vs 1 ciudadano = Impostor wins. So impostorsAlive >= citizensAlive es correcto para N impostores.
  }

  if (result) {
    await update(ref(db, `lobbies/${currentLobby}`), { status: "reveal", winner: result });
  } else {
    // Siguiente ronda
    await update(ref(db, `lobbies/${currentLobby}`), { round: lobby.round + 1 });
  }
}
