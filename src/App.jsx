import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
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
const googleProvider = new GoogleAuthProvider();

/*
  IMPORTANTE:
  Troque pelo e-mail Google do LOGIN MESTRE.
  O mestre nunca pode ser removido, bloqueado ou rebaixado pelo painel.
*/
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

function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
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
  const [carregandoLogin, setCarregandoLogin] = useState(true);
  const [perfilUsuario, setPerfilUsuario] = useState(null);

  const [tela, setTela] = useState("central");
  const [carros, setCarros] = useState([]);
  const [missoes, setMissoes] = useState({});
  const [usuarios, setUsuarios] = useState([]);
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

  const [novoEmail, setNovoEmail] = useState("");
  const [novaFuncao, setNovaFuncao] = useState("carro");

  const [nomeEmergencia, setNomeEmergencia] = useState("");
  const [telefoneEmergencia, setTelefoneEmergencia] = useState("");

  const intervaloRef = useRef(null);

  const emailUsuario = normalizarEmail(usuario?.email);
  const emailMestreNormalizado = normalizarEmail(emailMestre);
  const ehMestre = emailUsuario && emailUsuario === emailMestreNormalizado;
  const funcao = ehMestre ? "mestre" : perfilUsuario?.funcao || null;
  const acessoAtivo = ehMestre || perfilUsuario?.ativo === true;

  const podeVerCentral =
    acessoAtivo && ["mestre", "admin", "operador"].includes(funcao);
  const podeGerenciarUsuarios = acessoAtivo && ehMestre;
  const podeUsarPainelCarro = acessoAtivo && ["mestre", "admin", "operador", "carro"].includes(funcao);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUsuario(user || null);
      setCarregandoLogin(false);

      if (!user) {
        setPerfilUsuario(null);
        return;
      }

      const email = normalizarEmail(user.email);

      if (email === emailMestreNormalizado) {
        await setDoc(
          doc(db, "usuarios", email),
          {
            email,
            nome: user.displayName || "Mestre",
            foto: user.photoURL || "",
            funcao: "mestre",
            ativo: true,
            mestre: true,
            ultimoLogin: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        await setDoc(
          doc(db, "usuarios", email),
          {
            email,
            nome: user.displayName || "",
            foto: user.photoURL || "",
            ultimoLogin: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!usuario?.email) return;

    const email = normalizarEmail(usuario.email);
    const unsubscribe = onSnapshot(doc(db, "usuarios", email), (snapshot) => {
      if (snapshot.exists()) {
        setPerfilUsuario(snapshot.data());
      } else {
        setPerfilUsuario(null);
      }
    });

    return () => unsubscribe();
  }, [usuario]);

  useEffect(() => {
    if (!podeGerenciarUsuarios) return;

    const unsubscribe = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      const lista = snapshot.docs
        .map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }))
        .sort((a, b) => String(a.email).localeCompare(String(b.email)));

      setUsuarios(lista);
    });

    return () => unsubscribe();
  }, [podeGerenciarUsuarios]);

  useEffect(() => {
    if (!acessoAtivo) return;

    const unsubscribe = onSnapshot(doc(db, "configuracoes", "emergencia"), (snapshot) => {
      if (snapshot.exists()) {
        const dados = snapshot.data();
        setNomeEmergencia(dados.nome || "");
        setTelefoneEmergencia(dados.telefone || "");
      }
    });

    return () => unsubscribe();
  }, [acessoAtivo]);

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
    if (!acessoAtivo) return;

    const unsubscribe = onSnapshot(collection(db, "carros"), (snapshot) => {
      const lista = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      setCarros(lista);
    });

    return () => unsubscribe();
  }, [acessoAtivo]);

  useEffect(() => {
    if (!acessoAtivo) return;

    const unsubscribe = onSnapshot(collection(db, "missoes"), (snapshot) => {
      const lista = {};

      snapshot.docs.forEach((documento) => {
        lista[documento.id] = documento.data();
      });

      setMissoes(lista);
    });

    return () => unsubscribe();
  }, [acessoAtivo]);

  useEffect(() => {
    if (!idEquipe || !acessoAtivo) return;

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
  }, [idEquipe, acessoAtivo]);

  useEffect(() => {
    if (carregandoLogin || !usuario) return;

    if (!acessoAtivo) {
      setTela("bloqueado");
      return;
    }

    if (!podeVerCentral && podeUsarPainelCarro) {
      setTela("carro");
    }
  }, [carregandoLogin, usuario, acessoAtivo, podeVerCentral, podeUsarPainelCarro]);

  async function loginGoogle() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (erro) {
      console.log(erro);
      alert("Erro ao fazer login com Google.");
    }
  }

  async function sair() {
    await signOut(auth);
    setUsuario(null);
    setPerfilUsuario(null);
    setTela("central");
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

  function statusAtualDoCarro(idAtual) {
    const missao = missoes[idAtual];

    if (missao?.statusOperacional === "Solicitado") return "Solicitado";
    if (missao?.statusOperacional === "Em deslocamento") return "Em deslocamento";
    if (missao?.statusOperacional === "Em missão") return "Em missão";
    if (missao?.statusOperacional === "Apoio solicitado") return "Apoio solicitado";

    const carro = carros.find((c) => c.id === idAtual);
    if (carro?.status === "Emergência") return "Emergência";

    return "Livre";
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
      enviarLocalizacao(idAtual, statusAtualDoCarro(idAtual));
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

    if (telefoneEmergencia) {
      const confirmar = window.confirm(
        `Emergência enviada para a Central.\n\nDeseja ligar agora para ${nomeEmergencia || "o contato de emergência"}?`
      );

      if (confirmar) {
        ligarEmergencia();
      }
    } else {
      alert("Emergência enviada para a Central. Nenhum telefone de emergência foi cadastrado pelo Mestre.");
    }
  }

  function ligarEmergencia() {
    const telefone = String(telefoneEmergencia || "").replace(/\D/g, "");

    if (!telefone) {
      alert("Telefone de emergência não cadastrado.");
      return;
    }

    const telefoneFinal = telefone.startsWith("55") ? `+${telefone}` : `+55${telefone}`;
    window.location.href = `tel:${telefoneFinal}`;
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

  async function adicionarUsuario() {
    const email = normalizarEmail(novoEmail);

    if (!email) {
      alert("Informe o e-mail.");
      return;
    }

    if (email === emailMestreNormalizado) {
      alert("O e-mail mestre já possui acesso total permanente.");
      return;
    }

    await setDoc(
      doc(db, "usuarios", email),
      {
        email,
        funcao: novaFuncao,
        ativo: true,
        convitePendente: true,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        criadoPor: emailUsuario,
      },
      { merge: true }
    );

    setNovoEmail("");
    setNovaFuncao("carro");

    const assunto = encodeURIComponent("Convite para acessar a Operação Capivara");
    const corpo = encodeURIComponent(
      `Olá,\n\nVocê foi adicionado à plataforma Operação Capivara.\n\nFunção: ${novaFuncao}\n\nAcesse com sua conta Google:\n${window.location.origin}\n\nEquipe Operação Capivara`
    );

    window.open(`mailto:${email}?subject=${assunto}&body=${corpo}`, "_blank");

    alert("Usuário adicionado. O e-mail de convite foi aberto para envio.");
  }

  async function alterarFuncaoUsuario(email, novaFuncaoUsuario) {
    const emailNormalizado = normalizarEmail(email);

    if (emailNormalizado === emailMestreNormalizado) {
      alert("O usuário mestre não pode ter a função alterada.");
      return;
    }

    await updateDoc(doc(db, "usuarios", emailNormalizado), {
      funcao: novaFuncaoUsuario,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: emailUsuario,
    });
  }

  async function bloquearUsuario(email) {
    const emailNormalizado = normalizarEmail(email);

    if (emailNormalizado === emailMestreNormalizado) {
      alert("O usuário mestre não pode ser bloqueado.");
      return;
    }

    await updateDoc(doc(db, "usuarios", emailNormalizado), {
      ativo: false,
      bloqueadoEm: new Date().toISOString(),
      bloqueadoPor: emailUsuario,
    });
  }

  async function reativarUsuario(email) {
    const emailNormalizado = normalizarEmail(email);

    await updateDoc(doc(db, "usuarios", emailNormalizado), {
      ativo: true,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: emailUsuario,
    });
  }

  async function removerUsuario(email) {
    const emailNormalizado = normalizarEmail(email);

    if (emailNormalizado === emailMestreNormalizado) {
      alert("O usuário mestre não pode ser removido.");
      return;
    }

    const confirmar = window.confirm(`Remover acesso de ${emailNormalizado}?`);

    if (!confirmar) return;

    await deleteDoc(doc(db, "usuarios", emailNormalizado));
  }

  async function salvarTelefoneEmergencia() {
    if (!nomeEmergencia.trim()) {
      alert("Informe o nome do contato de emergência.");
      return;
    }

    if (!telefoneEmergencia.trim()) {
      alert("Informe o telefone de emergência.");
      return;
    }

    await setDoc(doc(db, "configuracoes", "emergencia"), {
      nome: nomeEmergencia.trim(),
      telefone: telefoneEmergencia.trim(),
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: emailUsuario,
    });

    alert("Telefone de emergência salvo.");
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

  if (carregandoLogin) {
    return <TelaSimples titulo="Operação Capivara" texto="Carregando..." />;
  }

  if (!usuario) {
    return (
      <TelaLogin onLogin={loginGoogle} />
    );
  }

  if (!acessoAtivo) {
    return (
      <TelaBloqueado usuario={usuario} onSair={sair} />
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
            {usuario.displayName || usuario.email} — {funcao?.toUpperCase()}
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

          {podeUsarPainelCarro && (
            <button
              onClick={() => setTela("carro")}
              style={{
                ...styles.navButton,
                ...(tela === "carro" ? styles.navButtonActive : {}),
              }}
            >
              Painel de Carro
            </button>
          )}

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
              <span>O carro precisa aceitar</span>
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
        </main>
      )}

      {podeUsarPainelCarro && tela === "carro" && (
        <main style={styles.driverPage}>
          <section style={styles.driverCard}>
            <div style={styles.panelHeader}>
              <strong>Painel de Carro</strong>
              <span>Copiloto opera o app</span>
            </div>

            {identificador && motorista && copiloto && (
              <div style={styles.carroResumo}>
                <strong>{identificador}</strong>
                <span>Motorista: {motorista}</span>
                <span>Copiloto: {copiloto}</span>
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

                    <button onClick={acionarEmergencia} style={styles.emergencyButton}>
                      🚨 EMERGÊNCIA
                    </button>

                    {telefoneEmergencia && (
                      <button onClick={ligarEmergencia} style={styles.phoneButton}>
                        📞 LIGAR PARA {nomeEmergencia || "EMERGÊNCIA"}
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div style={styles.livreBox}>
                <strong>🟢 LIVRE</strong>
                <p>Aguardando solicitação da Central.</p>
              </div>
            )}

            <div style={styles.formBox}>
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

              <label style={styles.label}>Identificação do veículo</label>
              <input
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="Ex: Gol prata, Carro 12"
                style={styles.input}
              />
            </div>

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

      {podeGerenciarUsuarios && tela === "mestre" && (
        <main style={styles.main}>
          <section style={styles.missionPanel}>
            <div style={styles.panelHeaderClean}>
              <strong>Painel Mestre</strong>
              <span>Controle de usuários e emergência</span>
            </div>

            <h3>Adicionar usuário</h3>

            <input
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
              placeholder="email@gmail.com"
              style={styles.inputFull}
            />

            <select
              value={novaFuncao}
              onChange={(e) => setNovaFuncao(e.target.value)}
              style={styles.inputFull}
            >
              <option value="carro">Carro</option>
              <option value="operador">Operador</option>
              <option value="admin">Admin/Coordenador</option>
            </select>

            <button onClick={adicionarUsuario} style={styles.startButtonFull}>
              ADICIONAR USUÁRIO
            </button>
          </section>

          <section style={styles.missionPanel}>
            <div style={styles.panelHeaderClean}>
              <strong>Telefone de emergência</strong>
              <span>Usado pelo Painel de Carro</span>
            </div>

            <input
              value={nomeEmergencia}
              onChange={(e) => setNomeEmergencia(e.target.value)}
              placeholder="Ex: Coordenador Geral"
              style={styles.inputFull}
            />

            <input
              value={telefoneEmergencia}
              onChange={(e) => setTelefoneEmergencia(e.target.value)}
              placeholder="Ex: 47999999999"
              style={styles.inputFull}
            />

            <button onClick={salvarTelefoneEmergencia} style={styles.startButtonFull}>
              SALVAR TELEFONE
            </button>
          </section>

          <section style={styles.missionPanel}>
            <div style={styles.panelHeaderClean}>
              <strong>Usuários cadastrados</strong>
              <span>{usuarios.length} registros</span>
            </div>

            {usuarios.map((item) => {
              const itemEmail = normalizarEmail(item.email);
              const itemEhMestre = itemEmail === emailMestreNormalizado;

              return (
                <div key={item.id} style={styles.userCard}>
                  <div>
                    <strong>{item.email}</strong>
                    <p>
                      Função: <b>{itemEhMestre ? "mestre" : item.funcao || "pendente"}</b>
                    </p>
                    <small>
                      Status: {itemEhMestre || item.ativo ? "Ativo" : "Bloqueado"} | Último login:{" "}
                      {formatarData(item.ultimoLogin)}
                    </small>
                  </div>

                  <div style={styles.userActions}>
                    {itemEhMestre ? (
                      <span style={styles.masterBadge}>MESTRE</span>
                    ) : (
                      <>
                        <select
                          value={item.funcao || "carro"}
                          onChange={(e) => alterarFuncaoUsuario(item.email, e.target.value)}
                          style={styles.userSelect}
                        >
                          <option value="carro">Carro</option>
                          <option value="operador">Operador</option>
                          <option value="admin">Admin/Coordenador</option>
                        </select>

                        {item.ativo ? (
                          <button onClick={() => bloquearUsuario(item.email)} style={styles.smallDanger}>
                            Bloquear
                          </button>
                        ) : (
                          <button onClick={() => reativarUsuario(item.email)} style={styles.smallSuccess}>
                            Reativar
                          </button>
                        )}

                        <button onClick={() => removerUsuario(item.email)} style={styles.smallNeutral}>
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </main>
      )}
    </div>
  );
}

function TelaLogin({ onLogin }) {
  return (
    <div style={styles.app}>
      <main style={styles.loginCard}>
        <div style={styles.kicker}>CENTRAL TÁTICA</div>
        <h1 style={styles.title}>OPERAÇÃO CAPIVARA</h1>
        <p style={styles.subtitle}>Acesse com sua conta Google autorizada.</p>
        <button onClick={onLogin} style={styles.startButtonFull}>
          ENTRAR COM GOOGLE
        </button>
      </main>
    </div>
  );
}

function TelaBloqueado({ usuario, onSair }) {
  return (
    <div style={styles.app}>
      <main style={styles.loginCard}>
        <h1 style={styles.title}>Acesso não autorizado</h1>
        <p style={styles.subtitle}>
          {usuario?.email} ainda não possui permissão ativa na Operação Capivara.
        </p>
        <button onClick={onSair} style={styles.stopButton}>
          SAIR
        </button>
      </main>
    </div>
  );
}

function TelaSimples({ titulo, texto }) {
  return (
    <div style={styles.app}>
      <main style={styles.loginCard}>
        <h1 style={styles.title}>{titulo}</h1>
        <p style={styles.subtitle}>{texto}</p>
      </main>
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
  loginCard: {
    maxWidth: 460,
    margin: "80px auto",
    background: "rgba(10,18,13,0.93)",
    border: "1px solid rgba(0,255,136,0.32)",
    borderRadius: 16,
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
    padding: 14,
    borderRadius: 12,
    background: "rgba(0,255,136,0.08)",
    border: "1px solid rgba(0,255,136,0.25)",
    display: "grid",
    gap: 4,
  },
  livreBox: {
    margin: 16,
    padding: 18,
    borderRadius: 14,
    background: "rgba(0,255,136,0.08)",
    border: "1px solid rgba(0,255,136,0.28)",
    textAlign: "center",
    fontSize: 16,
  },
  formBox: {
    marginTop: 12,
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
  emergencyButton: {
    width: "calc(100% - 32px)",
    margin: "10px 16px 0",
    padding: 17,
    borderRadius: 10,
    background: "#ff0033",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 16,
    boxShadow: "0 0 18px rgba(255,0,51,0.35)",
  },
  phoneButton: {
    width: "calc(100% - 32px)",
    margin: "10px 16px 0",
    padding: 16,
    borderRadius: 10,
    background: "#0055ff",
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
  userCard: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    background: "#111a14",
    border: "1px solid rgba(0,255,136,0.2)",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  userActions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  userSelect: {
    padding: 10,
    borderRadius: 8,
    background: "#080d09",
    color: "#d8ffe8",
    border: "1px solid rgba(0,255,136,0.35)",
  },
  masterBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#ffd000",
    color: "#061008",
    fontWeight: "bold",
  },
  smallDanger: {
    padding: "9px 10px",
    borderRadius: 8,
    background: "#aa0000",
    color: "#fff",
    border: "none",
    cursor: "pointer",
  },
  smallSuccess: {
    padding: "9px 10px",
    borderRadius: 8,
    background: "#00aa55",
    color: "#fff",
    border: "none",
    cursor: "pointer",
  },
  smallNeutral: {
    padding: "9px 10px",
    borderRadius: 8,
    background: "#26352b",
    color: "#d8ffe8",
    border: "1px solid rgba(0,255,136,0.35)",
    cursor: "pointer",
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
