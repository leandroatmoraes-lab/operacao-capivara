import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const firebaseConfig = {
  apiKey: "AIzaSyCCPNGSDVvbR6qSaPQDWfkj3Ts9BlO9ZQ8",
  authDomain: "operacao-capivara.firebaseapp.com",
  projectId: "operacao-capivara",
  storageBucket: "operacao-capivara.firebasestorage.app",
  messagingSenderId: "644314163593",
  appId: "1:644314163593:web:d346e4dbf111257e5f5958",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const emailMestre = "leandro.atmoraes@gmail.com";

const coresStatus = {
  Livre: "#00ff88",
  Solicitado: "#ffd000",
  "Em deslocamento": "#00aaff",
  "Em missão": "#ff9900",
  "Apoio solicitado": "#ff3333",
  Emergência: "#ff0033",
  Offline: "#777",
};

const nomesFuncoes = {
  mestre: "Mestre",
  admin: "Coordenador/Admin",
  operador: "Operador",
  carro: "Carro",
};

function normalizarEmail(email) {
  return (email || "").trim().toLowerCase();
}

function criarIconeCapivara(status, nivelSinal) {
  const corBase = coresStatus[status] || "#00ff88";
  const cor =
    nivelSinal === "perdido"
      ? "#ff3333"
      : nivelSinal === "atencao"
      ? "#ffd000"
      : corBase;

  const destaque =
    status === "Emergência" ||
    status === "Apoio solicitado" ||
    nivelSinal === "perdido";

  return L.divIcon({
    className: "",
    iconSize: destaque ? [60, 60] : [48, 48],
    iconAnchor: destaque ? [30, 60] : [24, 48],
    popupAnchor: [0, destaque ? -56 : -44],
    html: `
      <div style="
        width:${destaque ? 60 : 48}px;
        height:${destaque ? 60 : 48}px;
        border-radius:50%;
        background:${cor};
        border:3px solid #ffffff;
        box-shadow:0 0 ${destaque ? 24 : 12}px ${cor};
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:hidden;
        ${destaque ? "animation:pulse 1s infinite;" : ""}
      ">
        <img src="/capivara-192.png" style="
          width:${destaque ? 50 : 40}px;
          height:${destaque ? 50 : 40}px;
          object-fit:cover;
          border-radius:50%;
        " />
      </div>
    `,
  });
}

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [perfilUsuario, setPerfilUsuario] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [configuracao, setConfiguracao] = useState(null);

  const [mostrarCadastroUsuario, setMostrarCadastroUsuario] = useState(false);
  const [novoEmailUsuario, setNovoEmailUsuario] = useState("");
  const [novaFuncaoUsuario, setNovaFuncaoUsuario] = useState("carro");
  const [mostrarEmergenciaForm, setMostrarEmergenciaForm] = useState(false);
  const [emergenciaNome, setEmergenciaNome] = useState("");
  const [emergenciaTelefone, setEmergenciaTelefone] = useState("");
  const [mostrarAvisoForm, setMostrarAvisoForm] = useState(false);
  const [avisoGeralTexto, setAvisoGeralTexto] = useState("");
  const [avisoConfirmadoId, setAvisoConfirmadoId] = useState(
    () => localStorage.getItem("avisoConfirmadoId") || ""
  );

  const [tela, setTela] = useState("central");
  const [abaCentral, setAbaCentral] = useState("operacao");
  const [carros, setCarros] = useState([]);
  const [missoes, setMissoes] = useState({});
  const [agora, setAgora] = useState(Date.now());

  const [motorista, setMotorista] = useState(
    () => localStorage.getItem("motorista") || ""
  );
  const [copiloto, setCopiloto] = useState(
    () => localStorage.getItem("copiloto") || ""
  );
  const [identificador, setIdentificador] = useState(
    () => localStorage.getItem("identificador") || ""
  );
  const [idEquipe, setIdEquipe] = useState(
    () => localStorage.getItem("idEquipe") || ""
  );

  const [equipeMissao, setEquipeMissao] = useState("");
  const [missaoTexto, setMissaoTexto] = useState("");
  const [destinoMissao, setDestinoMissao] = useState("");

  const [missaoAtual, setMissaoAtual] = useState(null);
  const intervaloRef = useRef(null);

  const emailUsuario = normalizarEmail(usuario?.email);
  const ehMestre = emailUsuario === emailMestre;
  const funcao = ehMestre ? "mestre" : perfilUsuario?.funcao;
  const acessoAtivo = ehMestre || perfilUsuario?.ativo === true;
  const podeVerCentral = ["mestre", "admin", "operador"].includes(funcao);
  const podeGerenciarUsuarios = ehMestre;
  const podeEnviarMissao = ["mestre", "admin", "operador"].includes(funcao);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
      setCarregandoAuth(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!usuario) {
      setPerfilUsuario(null);
      return;
    }

    if (emailUsuario === emailMestre) {
      setPerfilUsuario({
        email: emailMestre,
        funcao: "mestre",
        ativo: true,
      });

      setDoc(
        doc(db, "usuarios", emailMestre),
        {
          email: emailMestre,
          funcao: "mestre",
          ativo: true,
          nome: usuario.displayName || "",
          foto: usuario.photoURL || "",
          ultimoLogin: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );

      return;
    }

    const unsubscribe = onSnapshot(doc(db, "usuarios", emailUsuario), async (snapshot) => {
      if (snapshot.exists()) {
        const dados = snapshot.data();
        setPerfilUsuario(dados);

        await setDoc(
          doc(db, "usuarios", emailUsuario),
          {
            ultimoLogin: new Date().toISOString(),
            nome: usuario.displayName || dados.nome || "",
            foto: usuario.photoURL || dados.foto || "",
          },
          { merge: true }
        );
      } else {
        setPerfilUsuario(null);
      }
    });

    return () => unsubscribe();
  }, [usuario, emailUsuario]);

  useEffect(() => {
    if (!usuario || !podeGerenciarUsuarios) return;

    const unsubscribe = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      const lista = snapshot.docs
        .map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }))
        .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

      setUsuarios(lista);
    });

    return () => unsubscribe();
  }, [usuario, podeGerenciarUsuarios]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "configuracoes", "geral"), (snapshot) => {
      if (snapshot.exists()) {
        const dados = snapshot.data();
        setConfiguracao(dados);
        setEmergenciaNome(dados.emergenciaNome || "");
        setEmergenciaTelefone(dados.emergenciaTelefone || "");
      } else {
        setConfiguracao(null);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => localStorage.setItem("motorista", motorista), [motorista]);
  useEffect(() => localStorage.setItem("copiloto", copiloto), [copiloto]);
  useEffect(
    () => localStorage.setItem("identificador", identificador),
    [identificador]
  );
  useEffect(() => localStorage.setItem("idEquipe", idEquipe), [idEquipe]);

  useEffect(() => {
    const timer = setInterval(() => {
      setAgora(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!usuario || !acessoAtivo) return;

    const unsubscribe = onSnapshot(collection(db, "carros"), (snapshot) => {
      const lista = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      setCarros(lista);
    });

    return () => unsubscribe();
  }, [usuario, acessoAtivo]);

  useEffect(() => {
    if (!usuario || !acessoAtivo) return;

    const unsubscribe = onSnapshot(collection(db, "missoes"), (snapshot) => {
      const lista = {};

      snapshot.docs.forEach((documento) => {
        lista[documento.id] = documento.data();
      });

      setMissoes(lista);
    });

    return () => unsubscribe();
  }, [usuario, acessoAtivo]);

  useEffect(() => {
    if (!idEquipe || !usuario || !acessoAtivo) return;

    const unsubscribe = onSnapshot(doc(db, "missoes", idEquipe), (snapshot) => {
      if (snapshot.exists()) {
        setMissaoAtual(snapshot.data());

        if (navigator.vibrate) {
          navigator.vibrate([300, 200, 300]);
        }
      } else {
        setMissaoAtual(null);
      }
    });

    return () => unsubscribe();
  }, [idEquipe, usuario, acessoAtivo]);

  useEffect(() => {
    if (!podeVerCentral && acessoAtivo) {
      setTela("carro");
    }
  }, [podeVerCentral, acessoAtivo]);

  async function loginGoogle() {
    await signInWithPopup(auth, provider);
  }

  async function sair() {
    await signOut(auth);
  }

  function gerarIdEquipe() {
    const nomeBase = copiloto || motorista || "carro";

    return `${nomeBase
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")}-${Date.now()}`;
  }

  function enviarLocalizacao(idAtual, statusAtual = "Livre") {
    if (!motorista.trim()) {
      alert("Informe o nome do motorista.");
      return;
    }

    if (!copiloto.trim()) {
      alert("Informe o nome do copiloto.");
      return;
    }

    if (!navigator.geolocation) {
      alert("GPS não suportado");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await setDoc(
          doc(db, "carros", idAtual),
          {
            motorista: motorista.trim(),
            copiloto: copiloto.trim(),
            identificador: identificador.trim(),
            status: statusAtual,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            online: true,
            atualizado: new Date().toISOString(),
            usuarioEmail: emailUsuario,
          },
          { merge: true }
        );
      },
      (erro) => {
        console.log(erro);
        alert("Erro ao pegar GPS");
      }
    );
  }

  function iniciarGPS() {
    if (!motorista.trim() || !copiloto.trim()) {
      alert("Informe motorista e copiloto antes de iniciar.");
      return;
    }

    let idAtual = idEquipe;

    if (!idAtual) {
      idAtual = gerarIdEquipe();
      setIdEquipe(idAtual);
    }

    enviarLocalizacao(idAtual, "Livre");

    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
    }

    intervaloRef.current = setInterval(() => {
      const missao = missoes[idAtual];
      const statusAtual =
        missao?.statusOperacional === "Solicitado"
          ? "Solicitado"
          : missao?.statusOperacional === "Em deslocamento"
          ? "Em deslocamento"
          : missao?.statusOperacional === "Em missão"
          ? "Em missão"
          : missao?.statusOperacional === "Apoio solicitado"
          ? "Apoio solicitado"
          : "Livre";

      enviarLocalizacao(idAtual, statusAtual);
    }, 15000);

    alert("Operação iniciada. Status: Livre");
  }

  async function pararGPS() {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }

    if (idEquipe) {
      await setDoc(
        doc(db, "carros", idEquipe),
        {
          online: false,
          status: "Offline",
          atualizado: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    alert("Operação parada.");
  }

  async function trocarCarro() {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }

    if (idEquipe) {
      await setDoc(
        doc(db, "carros", idEquipe),
        {
          online: false,
          status: "Offline",
          atualizado: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    localStorage.removeItem("motorista");
    localStorage.removeItem("copiloto");
    localStorage.removeItem("identificador");
    localStorage.removeItem("idEquipe");

    setMotorista("");
    setCopiloto("");
    setIdentificador("");
    setIdEquipe("");
    setMissaoAtual(null);

    alert("Carro limpo e removido da Central.");
  }

  async function enviarMissao() {
    if (!podeEnviarMissao) {
      alert("Você não tem permissão para enviar missão.");
      return;
    }

    if (!equipeMissao) {
      alert("Selecione um carro.");
      return;
    }

    if (!missaoTexto.trim()) {
      alert("Digite a missão.");
      return;
    }

    const agoraISO = new Date().toISOString();

    await setDoc(doc(db, "missoes", equipeMissao), {
      texto: missaoTexto.trim(),
      destino: destinoMissao.trim(),
      statusOperacional: "Solicitado",
      enviadaEm: agoraISO,
      atualizadoEm: agoraISO,
      enviadoPor: emailUsuario,
    });

    await setDoc(
      doc(db, "carros", equipeMissao),
      {
        status: "Solicitado",
        atualizado: agoraISO,
      },
      { merge: true }
    );

    setMissaoTexto("");
    setDestinoMissao("");

    alert("Solicitação enviada para o carro!");
  }

  async function aceitarMissao() {
    if (!idEquipe) return;

    const agoraISO = new Date().toISOString();

    await updateDoc(doc(db, "missoes", idEquipe), {
      statusOperacional: "Em deslocamento",
      aceitoEm: agoraISO,
      atualizadoEm: agoraISO,
    });

    await setDoc(
      doc(db, "carros", idEquipe),
      {
        status: "Em deslocamento",
        atualizado: agoraISO,
      },
      { merge: true }
    );

    alert("Missão aceita. Status: Em deslocamento");
  }

  async function recusarMissao() {
    if (!idEquipe) return;

    const agoraISO = new Date().toISOString();

    await updateDoc(doc(db, "missoes", idEquipe), {
      statusOperacional: "Recusada",
      recusadaEm: agoraISO,
      atualizadoEm: agoraISO,
    });

    await setDoc(
      doc(db, "carros", idEquipe),
      {
        status: "Livre",
        atualizado: agoraISO,
      },
      { merge: true }
    );

    setMissaoAtual(null);

    alert("Missão recusada. Status voltou para Livre.");
  }

  async function iniciarMissao() {
    if (!idEquipe) return;

    const agoraISO = new Date().toISOString();

    await updateDoc(doc(db, "missoes", idEquipe), {
      statusOperacional: "Em missão",
      iniciadoEm: agoraISO,
      atualizadoEm: agoraISO,
    });

    await setDoc(
      doc(db, "carros", idEquipe),
      {
        status: "Em missão",
        atualizado: agoraISO,
      },
      { merge: true }
    );
  }

  async function concluirMissao() {
    if (!idEquipe) return;

    const agoraISO = new Date().toISOString();

    await updateDoc(doc(db, "missoes", idEquipe), {
      statusOperacional: "Concluída",
      concluidaEm: agoraISO,
      atualizadoEm: agoraISO,
    });

    await setDoc(
      doc(db, "carros", idEquipe),
      {
        status: "Livre",
        atualizado: agoraISO,
      },
      { merge: true }
    );

    setMissaoAtual(null);

    alert("Missão concluída. Status voltou para Livre.");
  }

  async function pedirApoio() {
    if (!idEquipe) return;

    const agoraISO = new Date().toISOString();

    await updateDoc(doc(db, "missoes", idEquipe), {
      statusOperacional: "Apoio solicitado",
      apoioSolicitadoEm: agoraISO,
      atualizadoEm: agoraISO,
    });

    await setDoc(
      doc(db, "carros", idEquipe),
      {
        status: "Apoio solicitado",
        atualizado: agoraISO,
      },
      { merge: true }
    );

    if (navigator.vibrate) {
      navigator.vibrate([500, 300, 500]);
    }

    alert("Apoio solicitado para a Central.");
  }

  async function acionarEmergencia() {
    if (!idEquipe) return;

    const agoraISO = new Date().toISOString();

    await setDoc(
      doc(db, "carros", idEquipe),
      {
        status: "Emergência",
        atualizado: agoraISO,
      },
      { merge: true }
    );

    if (navigator.vibrate) {
      navigator.vibrate([700, 300, 700]);
    }

    alert("Emergência enviada para a Central.");
  }

  function ligarEmergencia() {
    const telefone = (configuracao?.emergenciaTelefone || "").replace(/\D/g, "");

    if (!telefone) {
      alert("Telefone de emergência não cadastrado pelo Mestre.");
      return;
    }

    window.location.href = `tel:+55${telefone}`;
  }

  function abrirGoogleMaps(destino) {
    if (!destino) {
      alert("Esta missão não possui destino.");
      return;
    }

    const endereco = encodeURIComponent(`${destino}, Blumenau, SC`);
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${endereco}&travelmode=driving`,
      "_blank"
    );
  }

  function abrirWaze(destino) {
    if (!destino) {
      alert("Esta missão não possui destino.");
      return;
    }

    const endereco = encodeURIComponent(`${destino}, Blumenau, SC`);
    window.open(`https://waze.com/ul?q=${endereco}&navigate=yes`, "_blank");
  }

  function segundosDesde(valor) {
    if (!valor) return 999999;
    return Math.floor((agora - new Date(valor).getTime()) / 1000);
  }

  function textoTempo(valor) {
    const segundos = segundosDesde(valor);

    if (segundos < 5) return "agora";
    if (segundos < 60) return `há ${segundos}s`;

    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `há ${minutos}min`;

    const horas = Math.floor(minutos / 60);
    return `há ${horas}h`;
  }

  function nivelSinal(valor) {
    const segundos = segundosDesde(valor);

    if (segundos > 90) return "perdido";
    if (segundos > 45) return "atencao";
    return "ok";
  }

  async function salvarUsuario() {
    if (!novoEmailUsuario.trim()) {
      alert("Informe o e-mail.");
      return;
    }

    const email = normalizarEmail(novoEmailUsuario);

    if (email === emailMestre) {
      alert("O usuário mestre já possui acesso permanente.");
      return;
    }

    await setDoc(
      doc(db, "usuarios", email),
      {
        email,
        funcao: novaFuncaoUsuario,
        ativo: true,
        convitePendente: true,
        criadoEm: new Date().toISOString(),
        criadoPor: emailUsuario,
      },
      { merge: true }
    );

    setNovoEmailUsuario("");
    setNovaFuncaoUsuario("carro");
    setMostrarCadastroUsuario(false);

    alert("Usuário incluído. Ele poderá acessar com a conta Google cadastrada.");
  }

  async function alterarFuncaoUsuario(email, funcaoNova) {
    const emailNormalizado = normalizarEmail(email);

    if (emailNormalizado === emailMestre) {
      alert("O usuário mestre não pode ter a função alterada.");
      return;
    }

    await updateDoc(doc(db, "usuarios", emailNormalizado), {
      funcao: funcaoNova,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: emailUsuario,
    });
  }

  async function removerUsuario(email) {
    const emailNormalizado = normalizarEmail(email);

    if (emailNormalizado === emailMestre) {
      alert("O usuário mestre não pode ser removido.");
      return;
    }

    const confirmar = confirm(`Remover acesso de ${emailNormalizado}?`);

    if (!confirmar) return;

    await deleteDoc(doc(db, "usuarios", emailNormalizado));
  }

  async function salvarEmergencia() {
    await setDoc(
      doc(db, "configuracoes", "geral"),
      {
        emergenciaNome: emergenciaNome.trim(),
        emergenciaTelefone: emergenciaTelefone.trim(),
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: emailUsuario,
      },
      { merge: true }
    );

    setMostrarEmergenciaForm(false);
    alert("Telefone de emergência salvo.");
  }

  async function enviarAvisoGeral() {
    if (!avisoGeralTexto.trim()) {
      alert("Digite a mensagem do aviso geral.");
      return;
    }

    const agoraISO = new Date().toISOString();

    await setDoc(
      doc(db, "configuracoes", "geral"),
      {
        avisoGeral: {
          id: `${Date.now()}`,
          texto: avisoGeralTexto.trim(),
          enviadoEm: agoraISO,
          enviadoPor: emailUsuario,
        },
      },
      { merge: true }
    );

    setAvisoGeralTexto("");
    setMostrarAvisoForm(false);
    alert("Aviso geral enviado para todos os carros conectados.");
  }

  function confirmarAvisoGeral() {
    const idAviso = configuracao?.avisoGeral?.id;

    if (!idAviso) return;

    localStorage.setItem("avisoConfirmadoId", idAviso);
    setAvisoConfirmadoId(idAviso);
  }

  const carrosOnline = carros.filter((c) => c.online);
  const online = carrosOnline.length;
  const solicitados = carrosOnline.filter((c) => c.status === "Solicitado").length;
  const deslocamento = carrosOnline.filter(
    (c) => c.status === "Em deslocamento"
  ).length;
  const emergencia = carrosOnline.filter((c) => c.status === "Emergência").length;
  const apoio = carrosOnline.filter((c) => c.status === "Apoio solicitado").length;
  const sinalAtencao = carrosOnline.filter(
    (c) => nivelSinal(c.atualizado) === "atencao"
  ).length;
  const sinalPerdido = carrosOnline.filter(
    (c) => nivelSinal(c.atualizado) === "perdido"
  ).length;

  const missaoVisivel =
    missaoAtual &&
    missaoAtual.statusOperacional !== "Concluída" &&
    missaoAtual.statusOperacional !== "Recusada";

  const avisoGeralVisivel =
    configuracao?.avisoGeral?.id &&
    configuracao.avisoGeral.id !== avisoConfirmadoId;

  const carroIniciado = Boolean(idEquipe);

  if (carregandoAuth) {
    return (
      <div style={styles.app}>
        <div style={styles.loginBox}>Carregando Operação Capivara...</div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div style={styles.app}>
        <div style={styles.loginBox}>
          <div style={styles.kicker}>ACESSO RESTRITO</div>
          <h1 style={styles.title}>OPERAÇÃO CAPIVARA</h1>
          <p>Entre com sua conta Google para acessar o sistema.</p>
          <button onClick={loginGoogle} style={styles.startButtonFull}>
            ENTRAR COM GOOGLE
          </button>
        </div>
      </div>
    );
  }

  if (!acessoAtivo) {
    return (
      <div style={styles.app}>
        <div style={styles.loginBox}>
          <h1 style={styles.title}>Acesso não autorizado</h1>
          <p>
            O e-mail <b>{usuario.email}</b> ainda não foi liberado pelo Mestre.
          </p>
          <button onClick={sair} style={styles.stopButtonFull}>
            SAIR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.18); }
            100% { transform: scale(1); }
          }
        `}
      </style>

      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>CENTRAL TÁTICA</div>
          <h1 style={styles.title}>OPERAÇÃO CAPIVARA</h1>
          <div style={styles.subtitle}>
            {usuario.email} — {nomesFuncoes[funcao] || funcao}
          </div>
        </div>

        <div style={styles.nav}>
          {podeVerCentral && (
            <button
              onClick={() => setTela("central")}
              style={{
                ...styles.navButton,
                ...(tela === "central" ? styles.navButtonActive : {}),
              }}
            >
              Central
            </button>
          )}

          <button
            onClick={() => setTela("carro")}
            style={{
              ...styles.navButton,
              ...(tela === "carro" ? styles.navButtonActive : {}),
            }}
          >
            Painel de Carro
          </button>

          {podeGerenciarUsuarios && (
            <button
              onClick={() => setTela("mestre")}
              style={{
                ...styles.navButton,
                ...(tela === "mestre" ? styles.navButtonActive : {}),
              }}
            >
              Painel Mestre
            </button>
          )}

          <button onClick={sair} style={styles.navButton}>
            Sair
          </button>
        </div>
      </header>

      {podeVerCentral && tela === "central" && (
        <main style={styles.main}>
          <section style={styles.centralTabs}>
            <button
              onClick={() => setAbaCentral("operacao")}
              style={{
                ...styles.tabButton,
                ...(abaCentral === "operacao" ? styles.tabButtonActive : {}),
              }}
            >
              🗺️ Operação
            </button>

            <button
              onClick={() => setAbaCentral("missoes")}
              style={{
                ...styles.tabButton,
                ...(abaCentral === "missoes" ? styles.tabButtonActive : {}),
              }}
            >
              📡 Missões
            </button>

            <button
              onClick={() => setAbaCentral("avisos")}
              style={{
                ...styles.tabButton,
                ...(abaCentral === "avisos" ? styles.tabButtonActive : {}),
              }}
            >
              📢 Avisos
            </button>

            {podeGerenciarUsuarios && (
              <button
                onClick={() => setAbaCentral("usuarios")}
                style={{
                  ...styles.tabButton,
                  ...(abaCentral === "usuarios" ? styles.tabButtonActive : {}),
                }}
              >
                👥 Usuários
              </button>
            )}

            <button
              onClick={() => setAbaCentral("sistema")}
              style={{
                ...styles.tabButton,
                ...(abaCentral === "sistema" ? styles.tabButtonActive : {}),
              }}
            >
              ⚙️ Sistema
            </button>
          </section>

          {abaCentral === "operacao" && (
            <>

          <section style={styles.statsGrid}>
            <div style={styles.statCard}>
              <span style={styles.statLabel}>Online</span>
              <strong style={styles.statValue}>{online}</strong>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statLabel}>Solicitados</span>
              <strong style={{ ...styles.statValue, color: "#ffd000" }}>
                {solicitados}
              </strong>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statLabel}>Em deslocamento</span>
              <strong style={{ ...styles.statValue, color: "#00aaff" }}>
                {deslocamento}
              </strong>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statLabel}>Apoio/Emergência</span>
              <strong style={{ ...styles.statValue, color: "#ff3333" }}>
                {apoio + emergencia}
              </strong>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statLabel}>Sinal atenção</span>
              <strong style={{ ...styles.statValue, color: "#ffd000" }}>
                {sinalAtencao}
              </strong>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statLabel}>Possível perda</span>
              <strong style={{ ...styles.statValue, color: "#ff3333" }}>
                {sinalPerdido}
              </strong>
            </div>
          </section>

          {(apoio > 0 || emergencia > 0) && (
            <section style={styles.alertApoio}>
              🚨 ATENÇÃO: existe carro solicitando apoio ou em emergência!
            </section>
          )}

          {sinalPerdido > 0 && (
            <section style={styles.alertSinal}>
              ⚠️ ATENÇÃO: existe carro sem atualização há mais de 90 segundos.
            </section>
          )}

          <section style={styles.mapPanelFull}>
            <div style={styles.panelHeader}>
              <strong>Mapa operacional</strong>
              <span>Blumenau / SC — clique na capivara para detalhes</span>
            </div>

            <div style={styles.mapWrapper}>
              <div style={styles.legend}>
                <div style={styles.legendTitle}>Legenda</div>
                <div>
                  <span style={{ ...styles.dot, background: "#00ff88" }} /> Livre
                </div>
                <div>
                  <span style={{ ...styles.dot, background: "#ffd000" }} />{" "}
                  Solicitado / sinal atenção
                </div>
                <div>
                  <span style={{ ...styles.dot, background: "#00aaff" }} /> Em
                  deslocamento
                </div>
                <div>
                  <span style={{ ...styles.dot, background: "#ff9900" }} /> Em
                  missão
                </div>
                <div>
                  <span style={{ ...styles.dot, background: "#ff3333" }} />{" "}
                  Apoio / emergência / sinal perdido
                </div>
              </div>

              <div style={styles.mapBoxFull}>
                <MapContainer
                  center={[-26.9167, -49.0667]}
                  zoom={13}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {carrosOnline.map((carro) => {
                    const missao = missoes[carro.id];
                    const sinal = nivelSinal(carro.atualizado);

                    return carro.latitude && carro.longitude ? (
                      <Marker
                        key={carro.id}
                        position={[carro.latitude, carro.longitude]}
                        icon={criarIconeCapivara(carro.status, sinal)}
                      >
                        <Popup>
                          <div style={{ minWidth: 250 }}>
                            <strong>{carro.identificador || "Veículo"}</strong>
                            <br />
                            <b>Motorista:</b>{" "}
                            {carro.motorista || "Não informado"}
                            <br />
                            <b>Copiloto:</b>{" "}
                            {carro.copiloto || "Não informado"}
                            <br />
                            <b>Status:</b> {carro.status || "Livre"}
                            <br />
                            <b>Última atividade:</b>{" "}
                            <span
                              style={{
                                color:
                                  sinal === "perdido"
                                    ? "#ff3333"
                                    : sinal === "atencao"
                                    ? "#ffd000"
                                    : "#00ff88",
                              }}
                            >
                              {textoTempo(carro.atualizado)}
                            </span>
                            <br />
                            <br />
                            <b>Destino:</b> {missao?.destino || "Sem destino"}
                            <br />
                            <b>Missão:</b> {missao?.texto || "Sem missão ativa"}
                            <br />
                            <b>Status da missão:</b>{" "}
                            {missao?.statusOperacional || "Sem status"}
                            <br />
                            <br />
                            <small>
                              Atualizado: {formatarData(carro.atualizado)}
                            </small>
                          </div>
                        </Popup>
                      </Marker>
                    ) : null;
                  })}
                </MapContainer>
              </div>
            </div>
          </section>

            </>
          )}

          {abaCentral === "missoes" && (
            <>
          {podeEnviarMissao && (
            <section style={styles.missionPanel}>
              <div style={styles.panelHeaderClean}>
                <strong>Enviar solicitação de missão</strong>
                <span>Carro precisa aceitar</span>
              </div>

              <select
                value={equipeMissao}
                onChange={(e) => setEquipeMissao(e.target.value)}
                style={styles.inputFull}
              >
                <option value="">Selecione um carro online</option>
                {carrosOnline
                  .filter((carro) => carro.status === "Livre")
                  .map((carro) => (
                    <option key={carro.id} value={carro.id}>
                      {carro.motorista} / {carro.copiloto} —{" "}
                      {carro.identificador || "sem veículo"} —{" "}
                      {textoTempo(carro.atualizado)}
                    </option>
                  ))}
              </select>

              <input
                value={destinoMissao}
                onChange={(e) => setDestinoMissao(e.target.value)}
                placeholder="Destino. Ex: Rua Parati, 95"
                style={styles.inputFull}
              />

              <textarea
                value={missaoTexto}
                onChange={(e) => setMissaoTexto(e.target.value)}
                placeholder="Descrição da missão"
                style={styles.textarea}
              />

              <button onClick={enviarMissao} style={styles.startButtonFull}>
                ENVIAR SOLICITAÇÃO
              </button>
            </section>
          )}


            </>
          )}

          {abaCentral === "avisos" && (
            <>
          {podeEnviarMissao && (
            <section style={styles.broadcastPanel}>
              <div style={styles.panelHeaderClean}>
                <strong>Aviso geral para carros</strong>
                <span>Mensagem aparece em todos os carros conectados</span>
              </div>

              {!mostrarAvisoForm ? (
                <button
                  onClick={() => setMostrarAvisoForm(true)}
                  style={styles.neutralButtonFull}
                >
                  + ENVIAR AVISO GERAL
                </button>
              ) : (
                <div style={styles.formInline}>
                  <textarea
                    value={avisoGeralTexto}
                    onChange={(e) => setAvisoGeralTexto(e.target.value)}
                    placeholder="Ex: Todos retornem para a base."
                    style={styles.textarea}
                  />

                  <button onClick={enviarAvisoGeral} style={styles.startButtonFull}>
                    ENVIAR PARA TODOS OS CARROS
                  </button>

                  <button
                    onClick={() => {
                      setMostrarAvisoForm(false);
                      setAvisoGeralTexto("");
                    }}
                    style={styles.stopButtonFull}
                  >
                    CANCELAR
                  </button>
                </div>
              )}

              {configuracao?.avisoGeral?.texto && (
                <div style={styles.infoBox}>
                  Último aviso: <b>{configuracao.avisoGeral.texto}</b>
                  <br />
                  <small>
                    Enviado em: {formatarData(configuracao.avisoGeral.enviadoEm)}
                  </small>
                </div>
              )}
            </section>
          )}


            </>
          )}

          {abaCentral === "usuarios" && podeGerenciarUsuarios && (
            <section style={styles.missionPanel}>
              <div style={styles.panelHeaderClean}>
                <strong>Usuários e permissões</strong>
                <span>Resumo rápido da Central</span>
              </div>

              <div style={styles.infoBox}>
                Para incluir, remover ou alterar funções, acesse o Painel Mestre completo.
              </div>

              <button
                onClick={() => setTela("mestre")}
                style={styles.startButtonFull}
              >
                ABRIR PAINEL MESTRE
              </button>

              <div style={styles.userList}>
                {usuarios.slice(0, 8).map((item) => (
                  <div key={item.email} style={styles.userItem}>
                    <div>
                      <strong>{item.email}</strong>
                      <p>{nomesFuncoes[item.funcao] || item.funcao}</p>
                      <small>Último login: {formatarData(item.ultimoLogin)}</small>
                    </div>
                    <span style={styles.userBadge}>
                      {item.ativo === false ? "Bloqueado" : "Ativo"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}


          {abaCentral === "sistema" && (
            <section style={styles.missionPanel}>
              <div style={styles.panelHeaderClean}>
                <strong>Sistema</strong>
                <span>Configurações e próximos módulos</span>
              </div>

              <div style={styles.systemGrid}>
                <div style={styles.systemCard}>
                  <strong>Telefone de emergência</strong>
                  <p>
                    {configuracao?.emergenciaNome || "Não cadastrado"} — {" "}
                    {configuracao?.emergenciaTelefone || "Sem telefone"}
                  </p>
                </div>

                <div style={styles.systemCard}>
                  <strong>Último aviso geral</strong>
                  <p>{configuracao?.avisoGeral?.texto || "Nenhum aviso enviado"}</p>
                </div>

                <div style={styles.systemCard}>
                  <strong>Status do app</strong>
                  <p>Online via Vercel + Firebase realtime.</p>
                </div>
              </div>

              {podeGerenciarUsuarios && (
                <button
                  onClick={() => setTela("mestre")}
                  style={styles.neutralButtonFull}
                >
                  ABRIR CONFIGURAÇÕES AVANÇADAS
                </button>
              )}
            </section>
          )}

        </main>
      )}

      {tela === "mestre" && podeGerenciarUsuarios && (
        <main style={styles.main}>
          <section style={styles.missionPanel}>
            <div style={styles.panelHeaderClean}>
              <strong>Painel Mestre</strong>
              <span>Usuários e emergência operacional</span>
            </div>

            <div style={styles.masterActions}>
              <button
                onClick={() => {
                  setMostrarCadastroUsuario((valorAtual) => !valorAtual);
                  setMostrarEmergenciaForm(false);
                  setMostrarAvisoForm(false);
                }}
                style={styles.startButtonFull}
              >
                {mostrarCadastroUsuario ? "RECOLHER CADASTRO" : "+ INCLUIR USUÁRIO"}
              </button>

              <button
                onClick={() => {
                  setMostrarEmergenciaForm((valorAtual) => !valorAtual);
                  setMostrarCadastroUsuario(false);
                  setMostrarAvisoForm(false);
                }}
                style={styles.neutralButtonFull}
              >
                {mostrarEmergenciaForm ? "RECOLHER EMERGÊNCIA" : "EDITAR EMERGÊNCIA"}
              </button>
            </div>

            {mostrarCadastroUsuario && (
              <div style={styles.formInline}>
                <input
                  value={novoEmailUsuario}
                  onChange={(e) => setNovoEmailUsuario(e.target.value)}
                  placeholder="E-mail do usuário"
                  style={styles.inputFull}
                />

                <select
                  value={novaFuncaoUsuario}
                  onChange={(e) => setNovaFuncaoUsuario(e.target.value)}
                  style={styles.inputFull}
                >
                  <option value="admin">Coordenador/Admin</option>
                  <option value="operador">Operador</option>
                  <option value="carro">Carro</option>
                </select>

                <button onClick={salvarUsuario} style={styles.startButtonFull}>
                  SALVAR USUÁRIO
                </button>

                <button
                  onClick={() => {
                    setMostrarCadastroUsuario(false);
                    setNovoEmailUsuario("");
                    setNovaFuncaoUsuario("carro");
                  }}
                  style={styles.stopButtonFull}
                >
                  CANCELAR
                </button>
              </div>
            )}

            {mostrarEmergenciaForm && (
              <div style={styles.formInline}>
                <input
                  value={emergenciaNome}
                  onChange={(e) => setEmergenciaNome(e.target.value)}
                  placeholder="Nome do contato. Ex: Coordenador Geral"
                  style={styles.inputFull}
                />

                <input
                  value={emergenciaTelefone}
                  onChange={(e) => setEmergenciaTelefone(e.target.value)}
                  placeholder="Telefone. Ex: 47999999999"
                  style={styles.inputFull}
                />

                <button onClick={salvarEmergencia} style={styles.startButtonFull}>
                  SALVAR EMERGÊNCIA
                </button>

                <button
                  onClick={() => setMostrarEmergenciaForm(false)}
                  style={styles.stopButtonFull}
                >
                  CANCELAR
                </button>
              </div>
            )}

            <div style={styles.infoBox}>
              Emergência atual:{" "}
              <b>
                {configuracao?.emergenciaNome || "Não cadastrado"} —{" "}
                {configuracao?.emergenciaTelefone || "Sem telefone"}
              </b>
            </div>

            <div style={styles.userList}>
              {usuarios.map((item) => {
                const itemEhMestre = normalizarEmail(item.email) === emailMestre;

                return (
                  <div key={item.email} style={styles.userItem}>
                    <div>
                      <strong>{item.email}</strong>
                      <p>
                        {itemEhMestre
                          ? "Mestre permanente"
                          : item.convitePendente
                          ? "Convite pendente / aguardando primeiro acesso"
                          : "Usuário ativo"}
                      </p>
                      <small>
                        Último login: {formatarData(item.ultimoLogin)}
                      </small>
                    </div>

                    <select
                      disabled={itemEhMestre}
                      value={itemEhMestre ? "mestre" : item.funcao}
                      onChange={(e) =>
                        alterarFuncaoUsuario(item.email, e.target.value)
                      }
                      style={styles.userSelect}
                    >
                      <option value="mestre">Mestre</option>
                      <option value="admin">Coordenador/Admin</option>
                      <option value="operador">Operador</option>
                      <option value="carro">Carro</option>
                    </select>

                    <button
                      disabled={itemEhMestre}
                      onClick={() => removerUsuario(item.email)}
                      style={{
                        ...styles.smallDangerButton,
                        opacity: itemEhMestre ? 0.45 : 1,
                        cursor: itemEhMestre ? "not-allowed" : "pointer",
                      }}
                    >
                      REMOVER
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      )}

      {tela === "carro" && (
        <main style={styles.driverPage}>
          <section style={styles.driverCard}>
            <div style={styles.panelHeader}>
              <strong>Painel de Carro</strong>
              <span>Copiloto opera o app</span>
            </div>

            {avisoGeralVisivel && (
              <div style={styles.avisoGeralBox}>
                <strong>📢 AVISO DA CENTRAL</strong>
                <p>{configuracao.avisoGeral.texto}</p>
                <small>
                  Enviado em: {formatarData(configuracao.avisoGeral.enviadoEm)}
                </small>
                <button onClick={confirmarAvisoGeral} style={styles.startButton}>
                  OK, ENTENDIDO
                </button>
              </div>
            )}

            {carroIniciado && (
              <div style={styles.carroResumo}>
                <h2>{identificador || "Carro em operação"}</h2>
                <p>
                  <b>Motorista:</b> {motorista}
                </p>
                <p>
                  <b>Copiloto:</b> {copiloto}
                </p>
                <div style={styles.statusLivre}>🟢 LIVRE / OPERACIONAL</div>
              </div>
            )}

            {missaoVisivel ? (
              <div
                style={{
                  ...styles.missionAlert,
                  borderColor:
                    coresStatus[missaoAtual.statusOperacional] || "#ffd000",
                }}
              >
                <strong>📡 MISSÃO RECEBIDA</strong>

                <p>{missaoAtual.texto}</p>

                <p>
                  <b>Destino:</b> {missaoAtual.destino || "Não informado"}
                </p>

                <p>
                  <b>Status:</b> {missaoAtual.statusOperacional}
                </p>

                {missaoAtual.statusOperacional === "Solicitado" && (
                  <>
                    <button onClick={aceitarMissao} style={styles.startButton}>
                      ACEITAR MISSÃO
                    </button>

                    <button onClick={recusarMissao} style={styles.stopButton}>
                      RECUSAR MISSÃO
                    </button>
                  </>
                )}

                {missaoAtual.statusOperacional !== "Solicitado" && (
                  <>
                    <button
                      onClick={() => abrirGoogleMaps(missaoAtual.destino)}
                      style={styles.blueButton}
                    >
                      ABRIR GOOGLE MAPS
                    </button>

                    <button
                      onClick={() => abrirWaze(missaoAtual.destino)}
                      style={styles.blueButton}
                    >
                      ABRIR WAZE
                    </button>

                    <button onClick={iniciarMissao} style={styles.yellowButton}>
                      INICIAR MISSÃO
                    </button>

                    <button onClick={concluirMissao} style={styles.startButton}>
                      CONCLUIR MISSÃO
                    </button>

                    <button onClick={pedirApoio} style={styles.stopButton}>
                      PEDIR APOIO
                    </button>

                    <button onClick={acionarEmergencia} style={styles.stopButton}>
                      EMERGÊNCIA
                    </button>

                    <button onClick={ligarEmergencia} style={styles.phoneButton}>
                      📞 LIGAR PARA{" "}
                      {configuracao?.emergenciaNome || "EMERGÊNCIA"}
                    </button>
                  </>
                )}
              </div>
            ) : carroIniciado ? (
              <div style={styles.infoBox}>
                Nenhuma missão ativa. Aguardando solicitação da Central.
              </div>
            ) : null}

            {!carroIniciado && (
              <>
                <label style={styles.label}>Motorista</label>
                <input
                  value={motorista}
                  onChange={(e) => setMotorista(e.target.value)}
                  placeholder="Nome do motorista"
                  style={styles.input}
                />

                <label style={styles.label}>Copiloto</label>
                <input
                  value={copiloto}
                  onChange={(e) => setCopiloto(e.target.value)}
                  placeholder="Nome do copiloto"
                  style={styles.input}
                />

                <label style={styles.label}>Identificação do carro</label>
                <input
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="Ex: Gol prata, Carro 12"
                  style={styles.input}
                />

                <button onClick={iniciarGPS} style={styles.startButton}>
                  INICIAR OPERAÇÃO
                </button>
              </>
            )}

            {carroIniciado && (
              <>
                <button onClick={pararGPS} style={styles.stopButton}>
                  PARAR OPERAÇÃO
                </button>

                <button onClick={trocarCarro} style={styles.neutralButton}>
                  TROCAR CARRO
                </button>
              </>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

function formatarData(valor) {
  if (!valor) return "Não informado";

  try {
    return new Date(valor).toLocaleString("pt-BR");
  } catch {
    return valor;
  }
}

const styles = {
  app: {
    background:
      "radial-gradient(circle at top, #17351f 0%, #0b0f0d 38%, #050705 100%)",
    minHeight: "100vh",
    color: "#d8ffe8",
    padding: 18,
    fontFamily: "Arial, sans-serif",
  },
  loginBox: {
    maxWidth: 520,
    margin: "80px auto",
    padding: 24,
    borderRadius: 18,
    background: "rgba(10,18,13,0.94)",
    border: "1px solid rgba(0,255,136,0.35)",
    textAlign: "center",
  },
  header: {
    maxWidth: 1300,
    margin: "0 auto 18px auto",
    padding: 18,
    border: "1px solid rgba(0,255,136,0.35)",
    borderRadius: 16,
    background: "rgba(10,18,13,0.88)",
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
  },
  kicker: {
    color: "#00ff88",
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: "bold",
  },
  title: {
    margin: "4px 0",
    fontSize: 34,
    color: "#ffffff",
  },
  subtitle: {
    color: "#9cffc8",
    fontSize: 14,
  },
  nav: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  navButton: {
    padding: "12px 18px",
    borderRadius: 10,
    border: "1px solid rgba(0,255,136,0.35)",
    background: "#101812",
    color: "#d8ffe8",
    cursor: "pointer",
    fontWeight: "bold",
  },
  navButtonActive: {
    background: "#00aa55",
    color: "#fff",
  },

  centralTabs: {
    maxWidth: 1300,
    margin: "0 auto 16px auto",
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    background: "rgba(10,18,13,0.72)",
    border: "1px solid rgba(0,255,136,0.18)",
    borderRadius: 14,
    padding: 10,
  },
  tabButton: {
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid rgba(0,255,136,0.25)",
    background: "#101812",
    color: "#d8ffe8",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: 13,
  },
  tabButtonActive: {
    background: "#00aa55",
    color: "#fff",
    border: "1px solid #00ff88",
  },
  systemGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  systemCard: {
    background: "#111a14",
    border: "1px solid rgba(0,255,136,0.18)",
    borderRadius: 12,
    padding: 14,
  },
  userBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(0,255,136,0.14)",
    border: "1px solid rgba(0,255,136,0.28)",
    color: "#d8ffe8",
    fontWeight: "bold",
    fontSize: 12,
  },
  main: {
    maxWidth: 1300,
    margin: "0 auto",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    background: "rgba(10,18,13,0.9)",
    border: "1px solid rgba(0,255,136,0.25)",
    borderRadius: 14,
    padding: 16,
  },
  statLabel: {
    display: "block",
    color: "#9cffc8",
    fontSize: 13,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 34,
    color: "#00ff88",
  },
  alertApoio: {
    maxWidth: 1300,
    margin: "0 auto 16px auto",
    background: "rgba(255,51,51,0.18)",
    border: "1px solid #ff3333",
    color: "#ffd6d6",
    padding: 16,
    borderRadius: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  alertSinal: {
    maxWidth: 1300,
    margin: "0 auto 16px auto",
    background: "rgba(255,208,0,0.15)",
    border: "1px solid #ffd000",
    color: "#fff2a8",
    padding: 16,
    borderRadius: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  missionPanel: {
    background: "rgba(10,18,13,0.9)",
    border: "1px solid rgba(255,208,0,0.35)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  broadcastPanel: {
    background: "rgba(10,18,13,0.9)",
    border: "1px solid rgba(0,170,255,0.35)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  avisoGeralBox: {
    margin: 16,
    padding: 16,
    borderRadius: 14,
    background: "rgba(0,170,255,0.16)",
    border: "1px solid #00aaff",
    color: "#dff4ff",
    fontSize: 15,
  },
  panelHeaderClean: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
    color: "#fff",
  },
  masterActions: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  formInline: {
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(0,255,136,0.25)",
    background: "rgba(0,255,136,0.05)",
    marginBottom: 14,
  },
  userList: {
    display: "grid",
    gap: 10,
    marginTop: 12,
  },
  userItem: {
    display: "grid",
    gridTemplateColumns: "1fr 190px 100px",
    gap: 10,
    alignItems: "center",
    background: "#111a14",
    border: "1px solid rgba(0,255,136,0.18)",
    borderRadius: 12,
    padding: 12,
  },
  userSelect: {
    padding: 10,
    borderRadius: 10,
    background: "#080d09",
    color: "#d8ffe8",
    border: "1px solid rgba(0,255,136,0.35)",
  },
  smallDangerButton: {
    padding: 10,
    borderRadius: 10,
    background: "#aa0000",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
  },
  mapPanelFull: {
    background: "rgba(10,18,13,0.9)",
    border: "1px solid rgba(0,255,136,0.25)",
    borderRadius: 16,
    overflow: "hidden",
  },
  panelHeader: {
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    borderBottom: "1px solid rgba(0,255,136,0.2)",
    color: "#ffffff",
  },
  mapWrapper: {
    position: "relative",
  },
  mapBoxFull: {
    height: "68vh",
    minHeight: 520,
  },
  legend: {
    position: "absolute",
    zIndex: 999,
    right: 16,
    bottom: 16,
    background: "rgba(8, 17, 11, 0.92)",
    border: "1px solid rgba(0,255,136,0.35)",
    borderRadius: 12,
    padding: 12,
    color: "#d8ffe8",
    fontSize: 13,
    lineHeight: 1.8,
  },
  legendTitle: {
    fontWeight: "bold",
    marginBottom: 6,
    color: "#fff",
  },
  dot: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: "50%",
    marginRight: 6,
  },
  driverPage: {
    maxWidth: 520,
    margin: "0 auto",
  },
  driverCard: {
    background: "rgba(10,18,13,0.93)",
    border: "1px solid rgba(0,255,136,0.32)",
    borderRadius: 16,
    overflow: "hidden",
    paddingBottom: 16,
  },
  carroResumo: {
    margin: 16,
    padding: 16,
    borderRadius: 14,
    background: "rgba(0,255,136,0.08)",
    border: "1px solid rgba(0,255,136,0.28)",
  },
  statusLivre: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    background: "rgba(0,255,136,0.13)",
    color: "#00ff88",
    fontWeight: "bold",
    textAlign: "center",
  },
  label: {
    display: "block",
    margin: "14px 16px 6px",
    color: "#9cffc8",
    fontSize: 13,
    fontWeight: "bold",
  },
  input: {
    width: "calc(100% - 32px)",
    margin: "0 16px",
    padding: 13,
    borderRadius: 10,
    background: "#080d09",
    color: "#d8ffe8",
    border: "1px solid rgba(0,255,136,0.35)",
    outline: "none",
    boxSizing: "border-box",
  },
  inputFull: {
    width: "100%",
    padding: 13,
    borderRadius: 10,
    background: "#080d09",
    color: "#d8ffe8",
    border: "1px solid rgba(0,255,136,0.35)",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 12,
  },
  textarea: {
    width: "100%",
    minHeight: 90,
    padding: 13,
    borderRadius: 10,
    background: "#080d09",
    color: "#d8ffe8",
    border: "1px solid rgba(0,255,136,0.35)",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 12,
    resize: "vertical",
  },
  startButton: {
    width: "calc(100% - 32px)",
    margin: "18px 16px 0",
    padding: 15,
    borderRadius: 10,
    background: "#00aa55",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 15,
  },
  startButtonFull: {
    width: "100%",
    padding: 15,
    borderRadius: 10,
    background: "#00aa55",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 15,
  },
  stopButton: {
    width: "calc(100% - 32px)",
    margin: "10px 16px 0",
    padding: 15,
    borderRadius: 10,
    background: "#aa0000",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 15,
  },
  stopButtonFull: {
    width: "100%",
    padding: 15,
    borderRadius: 10,
    background: "#aa0000",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 15,
  },
  neutralButton: {
    width: "calc(100% - 32px)",
    margin: "10px 16px 0",
    padding: 15,
    borderRadius: 10,
    background: "#26352b",
    color: "#d8ffe8",
    border: "1px solid rgba(0,255,136,0.35)",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 15,
  },
  neutralButtonFull: {
    width: "100%",
    padding: 15,
    borderRadius: 10,
    background: "#26352b",
    color: "#d8ffe8",
    border: "1px solid rgba(0,255,136,0.35)",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 15,
  },
  blueButton: {
    width: "calc(100% - 32px)",
    margin: "10px 16px 0",
    padding: 15,
    borderRadius: 10,
    background: "#0066cc",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 15,
  },
  yellowButton: {
    width: "calc(100% - 32px)",
    margin: "10px 16px 0",
    padding: 15,
    borderRadius: 10,
    background: "#d4a000",
    color: "#000",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 15,
  },
  phoneButton: {
    width: "calc(100% - 32px)",
    margin: "10px 16px 0",
    padding: 15,
    borderRadius: 10,
    background: "#ffffff",
    color: "#061008",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 15,
  },
  missionAlert: {
    margin: 16,
    padding: 14,
    borderRadius: 12,
    background: "rgba(255,208,0,0.15)",
    border: "1px solid #ffd000",
    color: "#fff2a8",
  },
  infoBox: {
    margin: 16,
    padding: 12,
    borderRadius: 10,
    background: "rgba(0,255,136,0.08)",
    border: "1px solid rgba(0,255,136,0.2)",
    color: "#bfffd8",
    fontSize: 13,
  },
};
