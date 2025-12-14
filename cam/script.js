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
    peer = new Peer();

    peer.on('open', () => {
        console.log('Conectando ao ID:', targetId);
        connectToBroadcaster(targetId);
    });

    peer.on('error', (err) => {
        console.error(err);
        overlayMsg.innerText = "Erro na conexão: " + err.type;
        // Tenta reconectar em breve se for desconexão
    });
}

function connectToBroadcaster(targetId) {
    const conn = peer.connect(targetId);

    conn.on('open', () => {
        console.log("Conexão de dados aberta");
        // Inicia a chamada de vídeo
        const call = peer.call(targetId, null); // Call sem enviar stream (apenas receber)

        call.on('stream', (remoteStream) => {
            console.log("Stream recebido!");
            remoteVideo.srcObject = remoteStream;
            overlayMsg.style.display = 'none'; // Esconde msg de aguardando
        });

        call.on('close', () => {
            overlayMsg.innerText = "Transmissão encerrada.";
            overlayMsg.style.display = 'block';
        });

        call.on('error', (err) => {
            console.error("Erro na chamada:", err);
        });
    });

    conn.on('close', () => {
        overlayMsg.innerText = "Desconectado do host.";
        overlayMsg.style.display = 'block';
    });
}

// Inicializa
init();
