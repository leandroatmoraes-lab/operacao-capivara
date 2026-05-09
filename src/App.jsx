import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
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

// TROQUE PELO SEU E-MAIL GOOGLE PRINCIPAL.
// Esse usuário nunca poderá ser bloqueado, removido ou rebaixado pelo painel.
const emailMestre = "leandro.atmoraes@gmail.com";

const funcoes = {
  mestre: "Mestre",
  admin: "Coordenador/Admin",
  operador: "Operador",
  carro: "Carro",
};

const coresStatus = {
  Livre: "#00ff88",
  Solicitado: "#ffd000",
  "Em deslocamento": "#00aaff",
  "Em missão": "#ff9900",
  "Apoio solicitado": "#ff3333",
  Emergência: "#ff0033",
  Offline: "#777",
};

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

function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [perfilUsuario, setPerfilUsuario] = useState(null);
  const [usuariosCadastrados, setUsuariosCadastrados] = useState([]);
  const [novoEmail, setNovoEmail] = useState("");
  const [novaFuncao, setNovaFuncao] = useState("carro");

  const [tela, setTela] = useState("central");
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
  const [setorMissao, setSetorMissao] = useState("");

  const [missaoAtual, setMissaoAtual] = useState(null);

  const intervaloRef = useRef(null);

  const emailUsuario = normalizarEmail(usuario?.email);
  const emailMestreNormalizado = normalizarEmail(emailMestre);
  const ehMestre = emailUsuario && emailUsuario === emailMestreNormalizado;
  const funcaoAtual = ehMestre ? "mestre" : perfilUsuario?.funcao;
  const usuarioAtivo = ehMestre || perfilUsuario?.ativo === true;
  const podeAcessarCentral = ["mestre", "admin", "operador"].includes(funcaoAtual);
  const podeGerenciarUsuarios = funcaoAtual === "mestre";

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

    const email = normalizarEmail(usuario.email);

    if (email === emailMestreNormalizado) {
      setPerfilUsuario({
        email,
        funcao: "mestre",
        ativo: true,
        conviteAceito: true,
      });
      return;
    }

    const unsubscribe = onSnapshot(doc(db, "usuarios", email), async (snapshot) => {
      if (!snapshot.exists()) {
        setPerfilUsuario(null);
        return;
      }

      const dados = snapshot.data();
      setPerfilUsuario(dados);

      if (dados.ativo) {
        await setDoc(
          doc(db, "usuarios", email),
          {
            ultimoLogin: new Date().toISOString(),
            conviteAceito: true,
            nome: usuario.displayName || "",
            foto: usuario.photoURL || "",
          },
          { merge: true }
        );
      }
    });

    return () => unsubscribe();
  }, [usuario, emailMestreNormalizado]);

  useEffect(() => {
    if (!podeGerenciarUsuarios) return;

    const unsubscribe = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      const lista = snapshot.docs
        .map((documento) => ({ id: documento.id, ...documento.data() }))
        .sort((a, b) => String(a.email).localeCompare(String(b.email)));

      setUsuariosCadastrados(lista);
    });

    return () => unsubscribe();
  }, [podeGerenciarUsuarios]);

  useEffect(() => {
    if (!carregandoAuth && usuario && !podeAcessarCentral && tela === "central") {
      setTela("carro");
    }
  }, [carregandoAuth, usuario, podeAcessarCentral, tela]);

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
    if (!usuarioAtivo) return;

    const unsubscribe = onSnapshot(collection(db, "carros"), (snapshot) => {
      const lista = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      setCarros(lista);
    });

    return () => unsubscribe();
  }, [usuarioAtivo]);

  useEffect(() => {
    if (!usuarioAtivo) return;

    const unsubscribe = onSnapshot(collection(db, "missoes"), (snapshot) => {
      const lista = {};

      snapshot.docs.forEach((documento) => {
        lista[documento.id] = documento.data();
      });

      setMissoes(lista);
    });

    return () => unsubscribe();
  }, [usuarioAtivo]);

  useEffect(() => {
    if (!idEquipe || !usuarioAtivo) return;

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
  }, [idEquipe, usuarioAtivo]);

  async function loginGoogle() {
    try {
      await signInWithPopup(auth, provider);
    } catch (erro) {
      console.log(erro);
      alert("Erro ao entrar com Google. Verifique o Firebase Authentication e o domínio autorizado.");
    }
  }

  async function sair() {
    await signOut(auth);
  }

  async function adicionarUsuario() {
    const email = normalizarEmail(novoEmail);

    if (!email) {
      alert("Informe o e-mail do usuário.");
      return;
    }

    if (email === emailMestreNormalizado) {
      alert("O usuário mestre já possui acesso total permanente.");
      return;
    }

    await setDoc(
      doc(db, "usuarios", email),
      {
        email,
        funcao: novaFuncao,
        ativo: true,
        conviteAceito: false,
        criadoEm: new Date().toISOString(),
        criadoPor: emailUsuario,
      },
      { merge: true }
    );

    setNovoEmail("");
    setNovaFuncao("carro");

    alert("Usuário adicionado. Envie o convite para ele acessar com a conta Google.");
  }

  async function alterarFuncaoUsuario(email, novaFuncaoUsuario) {
    const emailNormalizado = normalizarEmail(email);

    if (emailNormalizado === emailMestreNormalizado) {
      alert("O usuário mestre não pode ter a função alterada.");
      return;
    }

    await setDoc(
      doc(db, "usuarios", emailNormalizado),
      {
        funcao: novaFuncaoUsuario,
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: emailUsuario,
      },
      { merge: true }
    );
  }

  async function bloquearUsuario(email) {
    const emailNormalizado = normalizarEmail(email);

    if (emailNormalizado === emailMestreNormalizado) {
      alert("O usuário mestre não pode ser bloqueado.");
      return;
    }

    await setDoc(
      doc(db, "usuarios", emailNormalizado),
      {
        ativo: false,
        bloqueadoEm: new Date().toISOString(),
        bloqueadoPor: emailUsuario,
      },
      { merge: true }
    );
  }

  async function reativarUsuario(email) {
    const emailNormalizado = normalizarEmail(email);

    await setDoc(
      doc(db, "usuarios", emailNormalizado),
      {
        ativo: true,
        reativadoEm: new Date().toISOString(),
        reativadoPor: emailUsuario,
      },
      { merge: true }
    );
  }

  function abrirConviteEmail(email, funcao) {
    const assunto = encodeURIComponent("Convite para acessar a Operação Capivara");
    const corpo = encodeURIComponent(
      `Olá,\n\nVocê foi adicionado à plataforma Operação Capivara.\n\nFunção atribuída: ${funcoes[funcao] || funcao}\n\nPara ativar seu acesso, entre com sua conta Google no link abaixo:\n\nhttps://operacao-capivara.vercel.app\n\nApós o primeiro login seu acesso será validado automaticamente.\n\nEquipe Operação Capivara`
    );

    window.open(`mailto:${email}?subject=${assunto}&body=${corpo}`, "_blank");
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

  async function trocarEquipe() {
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
      setor: setorMissao.trim(),
      statusOperacional: "Solicitado",
      enviadaEm: agoraISO,
      atualizadoEm: agoraISO,
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
    setSetorMissao("");

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

    alert("Emergência enviada para a Central.");
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

  if (carregandoAuth) {
    return (
      <div style={styles.appCenter}>
        <div style={styles.loginCard}>Carregando Operação Capivara...</div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div style={styles.appCenter}>
        <div style={styles.loginCard}>
          <div style={styles.kicker}>CENTRAL TÁTICA</div>
          <h1 style={styles.title}>OPERAÇÃO CAPIVARA</h1>
          <p>Entre com sua conta Google para acessar o sistema.</p>
          <button onClick={loginGoogle} style={styles.startButtonFull}>
            ENTRAR COM GOOGLE
          </button>
        </div>
      </div>
    );
  }

  if (!usuarioAtivo) {
    return (
      <div style={styles.appCenter}>
        <div style={styles.loginCard}>
          <h2>Acesso não liberado</h2>
          <p>
            O e-mail <b>{usuario.email}</b> não está cadastrado ou está bloqueado.
          </p>
          <button onClick={sair} style={styles.neutralButtonFull}>
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
            {funcoes[funcaoAtual] || funcaoAtual} — {usuario.email}
          </div>
        </div>

        <div style={styles.nav}>
          {podeAcessarCentral && (
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
              onClick={() => setTela("usuarios")}
              style={{
                ...styles.navButton,
                ...(tela === "usuarios" ? styles.navButtonActive : {}),
              }}
            >
              Usuários
            </button>
          )}

          <button onClick={sair} style={styles.navButton}>
            Sair
          </button>
        </div>
      </header>

      {podeAcessarCentral && tela === "central" && (
        <main style={styles.main}>
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
              value={setorMissao}
              onChange={(e) => setSetorMissao(e.target.value)}
              placeholder="Setor operacional temporário. Ex: Garcia, Centro, Velha"
              style={styles.inputFull}
            />

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
                            <strong>{carro.identificador || "Carro"}</strong>
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
                            <b>Setor:</b> {missao?.setor || "Não definido"}
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

          {(sinalAtencao > 0 || sinalPerdido > 0) && (
            <section style={styles.sinalPanel}>
              <div style={styles.panelHeaderClean}>
                <strong>Monitor de sinal</strong>
                <span>Carros com atualização atrasada</span>
              </div>

              {carrosOnline
                .filter((carro) => nivelSinal(carro.atualizado) !== "ok")
                .map((carro) => {
                  const sinal = nivelSinal(carro.atualizado);

                  return (
                    <div
                      key={carro.id}
                      style={{
                        ...styles.sinalItem,
                        borderColor:
                          sinal === "perdido" ? "#ff3333" : "#ffd000",
                      }}
                    >
                      <strong>{carro.identificador || carro.motorista}</strong>
                      <span
                        style={{
                          color: sinal === "perdido" ? "#ff3333" : "#ffd000",
                          fontWeight: "bold",
                        }}
                      >
                        {textoTempo(carro.atualizado)}
                      </span>
                    </div>
                  );
                })}
            </section>
          )}
        </main>
      )}

      {tela === "carro" && (
        <main style={styles.driverPage}>
          <section style={styles.driverCard}>
            <div style={styles.panelHeader}>
              <strong>Painel de Carro</strong>
              <span>Copiloto opera o app</span>
            </div>

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
                  <b>Setor:</b> {missaoAtual.setor || "Não informado"}
                </p>

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
                  </>
                )}
              </div>
            ) : (
              <div style={styles.infoBox}>
                Nenhuma missão ativa. Aguardando solicitação da Central.
              </div>
            )}

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

            <button onClick={pararGPS} style={styles.stopButton}>
              PARAR OPERAÇÃO
            </button>

            <button onClick={trocarEquipe} style={styles.neutralButton}>
              TROCAR CARRO
            </button>
          </section>
        </main>
      )}

      {podeGerenciarUsuarios && tela === "usuarios" && (
        <main style={styles.main}>
          <section style={styles.userPanel}>
            <div style={styles.panelHeaderClean}>
              <strong>Painel Mestre de Usuários</strong>
              <span>Somente o usuário mestre acessa</span>
            </div>

            <div style={styles.userFormGrid}>
              <input
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                placeholder="email@exemplo.com"
                style={styles.inputFull}
              />

              <select
                value={novaFuncao}
                onChange={(e) => setNovaFuncao(e.target.value)}
                style={styles.inputFull}
              >
                <option value="admin">Coordenador/Admin</option>
                <option value="operador">Operador</option>
                <option value="carro">Carro</option>
              </select>

              <button onClick={adicionarUsuario} style={styles.startButtonFull}>
                ADICIONAR USUÁRIO
              </button>
            </div>

            <div style={styles.masterCard}>
              <strong>Usuário mestre</strong>
              <p>{emailMestreNormalizado}</p>
              <small>
                Permanente. Não pode ser removido, bloqueado ou rebaixado.
              </small>
            </div>

            {usuariosCadastrados.map((item) => (
              <div key={item.id} style={styles.userItem}>
                <div>
                  <strong>{item.email}</strong>
                  <p>
                    {item.ativo ? "🟢 Ativo" : "🔴 Bloqueado"} —{" "}
                    {item.conviteAceito ? "Convite aceito" : "Convite pendente"}
                  </p>
                  <small>Último login: {formatarData(item.ultimoLogin)}</small>
                </div>

                <select
                  value={item.funcao || "carro"}
                  onChange={(e) => alterarFuncaoUsuario(item.email, e.target.value)}
                  style={styles.smallSelect}
                >
                  <option value="admin">Coordenador/Admin</option>
                  <option value="operador">Operador</option>
                  <option value="carro">Carro</option>
                </select>

                <div style={styles.userActions}>
                  <button
                    onClick={() => abrirConviteEmail(item.email, item.funcao)}
                    style={styles.smallButton}
                  >
                    Convite
                  </button>

                  {item.ativo ? (
                    <button
                      onClick={() => bloquearUsuario(item.email)}
                      style={styles.smallDangerButton}
                    >
                      Bloquear
                    </button>
                  ) : (
                    <button
                      onClick={() => reativarUsuario(item.email)}
                      style={styles.smallButton}
                    >
                      Reativar
                    </button>
                  )}
                </div>
              </div>
            ))}
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
      "radial-gradient(circle at top, #17351f 0%, #0b0d0f 38%, #050705 100%)",
    minHeight: "100vh",
    color: "#d8ffe8",
    padding: 18,
    fontFamily: "Arial, sans-serif",
  },
  appCenter: {
    background:
      "radial-gradient(circle at top, #17351f 0%, #0b0d0f 38%, #050705 100%)",
    minHeight: "100vh",
    color: "#d8ffe8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    fontFamily: "Arial, sans-serif",
  },
  loginCard: {
    width: "100%",
    maxWidth: 460,
    background: "rgba(10,18,13,0.92)",
    border: "1px solid rgba(0,255,136,0.35)",
    borderRadius: 18,
    padding: 24,
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
    justifyContent: "flex-end",
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
  panelHeaderClean: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
    color: "#fff",
    gap: 12,
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
  sinalPanel: {
    background: "rgba(10,18,13,0.9)",
    border: "1px solid rgba(255,208,0,0.35)",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  sinalItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    background: "#111a14",
    border: "1px solid #ffd000",
    borderLeft: "6px solid",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
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
  userPanel: {
    background: "rgba(10,18,13,0.9)",
    border: "1px solid rgba(0,255,136,0.25)",
    borderRadius: 16,
    padding: 16,
  },
  userFormGrid: {
    display: "grid",
    gridTemplateColumns: "1.5fr 1fr auto",
    gap: 12,
    alignItems: "start",
  },
  masterCard: {
    background: "rgba(255,208,0,0.12)",
    border: "1px solid #ffd000",
    borderRadius: 12,
    padding: 14,
    margin: "14px 0",
    color: "#fff2a8",
  },
  userItem: {
    display: "grid",
    gridTemplateColumns: "1fr 220px auto",
    gap: 12,
    alignItems: "center",
    background: "#111a14",
    border: "1px solid rgba(0,255,136,0.18)",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  smallSelect: {
    padding: 10,
    borderRadius: 8,
    background: "#080d09",
    color: "#d8ffe8",
    border: "1px solid rgba(0,255,136,0.35)",
  },
  userActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  smallButton: {
    padding: "10px 12px",
    borderRadius: 8,
    background: "#0066cc",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
  },
  smallDangerButton: {
    padding: "10px 12px",
    borderRadius: 8,
    background: "#aa0000",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
  },
};
