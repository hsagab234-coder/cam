const urlParams = new URLSearchParams(window.location.search);
const viewId = urlParams.get('view');

// Elementos UI
const broadcasterUI = document.getElementById('broadcaster-ui');
const viewerUI = document.getElementById('viewer-ui');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const cameraSelect = document.getElementById('camera-select');
const startBtn = document.getElementById('start-btn');
const connectionInfo = document.getElementById('connection-info');
const obsLinkInput = document.getElementById('obs-link');
const copyBtn = document.getElementById('copy-btn');
const statusText = document.getElementById('status-text');
const overlayMsg = document.getElementById('overlay-msg');

let localStream = null;
let peer = null;

async function init() {
    if (viewId) {
        // MODO VIEWER (OBS)
        viewerUI.style.display = 'flex';
        initViewer(viewId);
    } else {
        // MODO BROADCASTER (Celular)
        broadcasterUI.style.display = 'flex';
        await getCameras();
        initBroadcaster();
    }
}

// ========================
// Lógica do Broadcaster
// ========================

async function getCameras() {
    try {
        // Solicita permissão inicial para listar devices corretamente (labels)
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraSelect.innerHTML = '';

        // Tenta encontrar a câmera traseira automaticamente para selecionar
        let defaultIndex = 0;

        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Câmera ${index + 1}`;

            // Tenta detectar "back", "traseira", "environment"
            const labelLower = (device.label || '').toLowerCase();
            if (labelLower.includes('back') || labelLower.includes('traseira') || labelLower.includes('environment')) {
                defaultIndex = index;
            }

            cameraSelect.appendChild(option);
        });

        cameraSelect.selectedIndex = defaultIndex;

    } catch (error) {
        console.error("Erro ao listar câmeras:", error);
        alert("Erro ao acessar permissões de câmera. Verifique se está usando HTTPS.");
    }
}

function initBroadcaster() {
    // Cria um Peer com ID aleatório
    peer = new Peer();

    peer.on('open', (id) => {
        console.log('Meu ID de Peer:', id);
        // Gera o link completo
        const link = `${window.location.href.split('?')[0]}?view=${id}`;
        obsLinkInput.value = link;
    });

    peer.on('connection', (conn) => {
        statusText.innerText = "Conectado ao OBS!";
        statusText.style.color = "#4CAF50";
    });

    peer.on('call', (call) => {
        // Quando o OBS "liga" para nós, atendemos com nosso stream
        if (localStream) {
            call.answer(localStream);
        } else {
            console.warn("Recebida chamada sem stream local pronto.");
        }
    });

    startBtn.addEventListener('click', startStreaming);
    copyBtn.addEventListener('click', () => {
        obsLinkInput.select();
        document.execCommand('copy');
        copyBtn.innerText = "Copiado!";
        setTimeout(() => copyBtn.innerText = "Copiar", 2000);
    });
}

async function startStreaming() {
    const deviceId = cameraSelect.value;
    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 1920 }, // Tenta HD/Full HD se possível
            height: { ideal: 1080 }
        },
        audio: false // OBS geralmente não precisa de audio da camweb, mas pode ativar se quiser
    };

    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        connectionInfo.classList.remove('hidden');
        startBtn.innerText = "Câmera Ativa (Reiniciar)";

        // Mostrar link
        connectionInfo.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error("Erro ao acessar câmera:", err);
        alert("Erro ao iniciar câmera: " + err.message);
    }
}


// ========================
// Lógica do Viewer (OBS)
// ========================

function initViewer(targetId) {
    const statusMsg = document.getElementById('overlay-msg');
    statusMsg.innerText = "Inicializando conexão...";

    peer = new Peer();

    peer.on('open', (myId) => {
        console.log('Viewer ID:', myId);
        statusMsg.innerText = "Conectado ao servidor. Buscando câmera...";
        // Tenta conectar imediatamente via dados e vídeo
        connectToBroadcaster(targetId);
    });

    peer.on('error', (err) => {
        console.error(err);
        let msg = "Erro desconhecido";
        if (err.type === 'peer-unavailable') msg = "Câmera não encontrada (ID incorreto ou offline).";
        if (err.type === 'network') msg = "Erro de rede / Falha na conexão.";
        if (err.type === 'browser-incompatible') msg = "Navegador incompatível.";

        statusMsg.innerHTML = `<span style="color: #ff5555">${msg}</span><br><small>${err.type}</small>`;
    });
}

function connectToBroadcaster(targetId) {
    const statusMsg = document.getElementById('overlay-msg');

    // 1. Tenta estabelecer canal de dados (para confirmar status)
    const conn = peer.connect(targetId);

    conn.on('open', () => {
        console.log("Conexão de dados estabelecida");
        statusMsg.innerText = "Sinal encontrado. Solicitando vídeo...";
    });

    conn.on('close', () => {
        console.log("Host desconectou");
        statusMsg.innerText = "Câmera desconectada.";
    });

    // 2. Tenta iniciar chamada de vídeo (Pull)
    // Pequeno delay para garantir que o PeerJS registrou o peer remoto se for muito rápido
    setTimeout(() => {
        console.log("Iniciando chamada de vídeo para:", targetId);

        // Passamos 'null' ou um stream vazio pois só queremos receber
        const call = peer.call(targetId, null);

        if (!call) {
            statusMsg.innerText = "Falha ao iniciar chamada (PeerJS retornou null).";
            return;
        }

        call.on('stream', (remoteStream) => {
            console.log("Stream de vídeo recebido!");
            remoteVideo.srcObject = remoteStream;

            // Garantir que o play ocorra (necessário para OBS browser source às vezes)
            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error("Auto-play prevented:", error);
                    statusMsg.innerText = "Clique para iniciar vídeo (Auto-play bloqueado).";
                });
            }

            statusMsg.style.display = 'none'; // Sucesso!
        });

        call.on('close', () => {
            statusMsg.style.display = 'block';
            statusMsg.innerText = "Transmissão encerrada pelo host.";
        });

        call.on('error', (err) => {
            console.error("Erro na chamada:", err);
            statusMsg.innerText = "Erro na chamada de vídeo: " + err.type;
        });

    }, 1000);
}

// Inicializa
init();
