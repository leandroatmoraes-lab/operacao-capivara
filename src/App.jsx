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
  signOut,
  onAuthStateChanged,
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

export default function App() {
  const [tela, setTela] = useState("central");
  const [carros, setCarros] = useState([]);
  const [missoes, setMissoes] = useState({});
  const [agora, setAgora] = useState(Date.now());
  const [usuario, setUsuario] = useState(null);
  const [carregandoLogin, setCarregandoLogin] = useState(true);

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
      setCarregandoLogin(false);
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
    const unsubscribe = onSnapshot(collection(db, "carros"), (snapshot) => {
      const lista = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      setCarros(lista);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "missoes"), (snapshot) => {
      const lista = {};

      snapshot.docs.forEach((documento) => {
        lista[documento.id] = documento.data();
      });

      setMissoes(lista);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!idEquipe) return;

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
  }, [idEquipe]);

  async function entrarComGoogle() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (erro) {
      console.log("Erro no login:", erro);
      alert("Não foi possível entrar com Google.");
    }
  }

  async function sairDaConta() {
    try {
      await signOut(auth);
    } catch (erro) {
      console.log("Erro ao sair:", erro);
      alert("Não foi possível sair da conta.");
    }
  }

  function gerarIdEquipe() {
    const nomeBase = copiloto || motorista || "equipe";

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

    alert("Equipe limpa e removida da Central.");
  }

  async function enviarMissao() {
    if (!equipeMissao) {
      alert("Selecione uma equipe.");
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

    alert("Solicitação enviada para a equipe!");
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

  if (carregandoLogin) {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginCard}>
          <h1 style={styles.title}>OPERAÇÃO CAPIVARA</h1>
          <p>Carregando acesso...</p>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginCard}>
          <div style={styles.kicker}>ACESSO RESTRITO</div>
          <h1 style={styles.title}>OPERAÇÃO CAPIVARA</h1>
          <p style={styles.loginText}>
            Entre com sua conta Google para acessar a Central Operacional.
          </p>

          <button onClick={entrarComGoogle} style={styles.loginButton}>
            ENTRAR COM GOOGLE
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
          <div style={styles.subtitle}>Controle total da missão</div>
        </div>

        <div style={styles.nav}>
          <div style={styles.userBox}>
            <span>{usuario.displayName || "Usuário"}</span>
            <small>{usuario.email}</small>
          </div>

          <button onClick={sairDaConta} style={styles.logoutButton}>
            Sair
          </button>

          <button
            onClick={() => setTela("central")}
            style={{
              ...styles.navButton,
              ...(tela === "central" ? styles.navButtonActive : {}),
            }}
          >
            Central
          </button>

          <button
            onClick={() => setTela("motorista")}
            style={{
              ...styles.navButton,
              ...(tela === "motorista" ? styles.navButtonActive : {}),
            }}
          >
            Equipe
          </button>
        </div>
      </header>

      {tela === "central" && (
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
              🚨 ATENÇÃO: existe equipe solicitando apoio ou em emergência!
            </section>
          )}

          {sinalPerdido > 0 && (
            <section style={styles.alertSinal}>
              ⚠️ ATENÇÃO: existe equipe sem atualização há mais de 90 segundos.
            </section>
          )}

          <section style={styles.missionPanel}>
            <div style={styles.panelHeaderClean}>
              <strong>Enviar solicitação de missão</strong>
              <span>Equipe precisa aceitar</span>
            </div>

            <select
              value={equipeMissao}
              onChange={(e) => setEquipeMissao(e.target.value)}
              style={styles.inputFull}
            >
              <option value="">Selecione uma equipe online</option>
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
              placeholder="Setor. Ex: Garcia, Centro, Velha"
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
                <span>Equipes com atualização atrasada</span>
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

      {tela === "motorista" && (
        <main style={styles.driverPage}>
          <section style={styles.driverCard}>
            <div style={styles.panelHeader}>
              <strong>Painel da Equipe</strong>
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

            <label style={styles.label}>Identificação do veículo</label>
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
              TROCAR EQUIPE
            </button>
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
  loginPage: {
    background:
      "radial-gradient(circle at top, #17351f 0%, #0b0f0d 38%, #050705 100%)",
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
    maxWidth: 430,
    background: "rgba(10,18,13,0.92)",
    border: "1px solid rgba(0,255,136,0.35)",
    borderRadius: 18,
    padding: 24,
    textAlign: "center",
    boxShadow: "0 0 30px rgba(0,255,136,0.08)",
  },
  loginText: {
    color: "#bfffd8",
    lineHeight: 1.5,
    marginBottom: 22,
  },
  loginButton: {
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
  userBox: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    color: "#d8ffe8",
    fontSize: 13,
    border: "1px solid rgba(0,255,136,0.25)",
    borderRadius: 10,
    padding: "8px 12px",
    background: "#101812",
  },
  logoutButton: {
    padding: "12px 18px",
    borderRadius: 10,
    border: "1px solid rgba(255,51,51,0.45)",
    background: "#301111",
    color: "#ffd6d6",
    cursor: "pointer",
    fontWeight: "bold",
  },
  app: {
    background:
      "radial-gradient(circle at top, #17351f 0%, #0b0f0d 38%, #050705 100%)",
    minHeight: "100vh",
    color: "#d8ffe8",
    padding: 18,
    fontFamily: "Arial, sans-serif",
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
};