import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  onSnapshot,
} from "firebase/firestore";

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

const iconeCapivara = new L.Icon({
  iconUrl: "/capivara-192.png",
  iconSize: [42, 42],
  iconAnchor: [21, 42],
  popupAnchor: [0, -38],
});

const coresStatus = {
  Livre: "#00ff88",
  "Em missão": "#ffd000",
  Apoio: "#00aaff",
  Emergência: "#ff3333",
  Offline: "#777",
};

const coresMissao = {
  "Nova missão": "#ffd000",
  "Em deslocamento": "#00aaff",
  "Missão concluída": "#00ff88",
  "🚨 Aguardando apoio": "#ff3333",
};

export default function App() {
  const [tela, setTela] = useState("central");
  const [status, setStatus] = useState("Livre");
  const [carros, setCarros] = useState([]);
  const [missoes, setMissoes] = useState({});
  const [historico, setHistorico] = useState([]);

  const [motorista, setMotorista] = useState(() => localStorage.getItem("motorista") || "");
  const [copiloto, setCopiloto] = useState(() => localStorage.getItem("copiloto") || "");
  const [identificador, setIdentificador] = useState(() => localStorage.getItem("identificador") || "");
  const [idEquipe, setIdEquipe] = useState(() => localStorage.getItem("idEquipe") || "");

  const [missaoTexto, setMissaoTexto] = useState("");
  const [equipeMissao, setEquipeMissao] = useState("");
  const [missaoAtual, setMissaoAtual] = useState(null);

  const intervaloRef = useRef(null);
  const primeiraLeituraMissoesRef = useRef(true);
  const primeiraLeituraMissaoEquipeRef = useRef(true);
  const pedidosApoioAnterioresRef = useRef(new Set());
  const ultimaMissaoEquipeRef = useRef(null);

  useEffect(() => localStorage.setItem("motorista", motorista), [motorista]);
  useEffect(() => localStorage.setItem("copiloto", copiloto), [copiloto]);
  useEffect(() => localStorage.setItem("identificador", identificador), [identificador]);
  useEffect(() => localStorage.setItem("idEquipe", idEquipe), [idEquipe]);

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
      const pedidosApoioAtuais = new Set();
      let novoPedidoApoio = false;

      snapshot.docs.forEach((documento) => {
        const dados = documento.data();
        lista[documento.id] = dados;

        if (dados.statusOperacional === "🚨 Aguardando apoio") {
          pedidosApoioAtuais.add(documento.id);

          if (!pedidosApoioAnterioresRef.current.has(documento.id)) {
            novoPedidoApoio = true;
          }
        }
      });

      if (!primeiraLeituraMissoesRef.current && novoPedidoApoio) {
        if (navigator.vibrate) {
          navigator.vibrate([500, 300, 500, 300, 500]);
        }
      }

      primeiraLeituraMissoesRef.current = false;
      pedidosApoioAnterioresRef.current = pedidosApoioAtuais;
      setMissoes(lista);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "historico_missoes"), (snapshot) => {
      const lista = snapshot.docs
        .map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }))
        .sort((a, b) => {
          const dataA = new Date(a.criadoEm || 0).getTime();
          const dataB = new Date(b.criadoEm || 0).getTime();
          return dataB - dataA;
        })
        .slice(0, 20);

      setHistorico(lista);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!idEquipe) return;

    primeiraLeituraMissaoEquipeRef.current = true;

    const unsubscribe = onSnapshot(doc(db, "missoes", idEquipe), (snapshot) => {
      if (snapshot.exists()) {
        const dados = snapshot.data();
        const missaoNova =
          dados.enviadaEm && dados.enviadaEm !== ultimaMissaoEquipeRef.current;

        if (!primeiraLeituraMissaoEquipeRef.current && missaoNova) {
          if (navigator.vibrate) {
            navigator.vibrate([300, 200, 300]);
          }
        }

        ultimaMissaoEquipeRef.current = dados.enviadaEm || null;
        primeiraLeituraMissaoEquipeRef.current = false;
        setMissaoAtual(dados);
      } else {
        primeiraLeituraMissaoEquipeRef.current = false;
        ultimaMissaoEquipeRef.current = null;
        setMissaoAtual(null);
      }
    });

    return () => unsubscribe();
  }, [idEquipe]);

  function gerarIdEquipe() {
    const nomeBase = motorista
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    return `${nomeBase}-${Date.now()}`;
  }

  function enviarLocalizacao(idAtual) {
    if (!motorista.trim()) {
      alert("Informe o nome do motorista antes de iniciar.");
      return;
    }

    if (!navigator.geolocation) {
      alert("GPS não suportado");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await setDoc(doc(db, "carros", idAtual), {
          motorista: motorista.trim(),
          copiloto: copiloto.trim(),
          identificador: identificador.trim(),
          status,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          online: true,
          atualizado: new Date().toISOString(),
        });
      },
      (erro) => {
        console.log(erro);
        alert("Erro ao pegar GPS");
      }
    );
  }

  function iniciarGPS() {
    if (!motorista.trim()) {
      alert("Informe o nome do motorista antes de iniciar.");
      return;
    }

    let idAtual = idEquipe;

    if (!idAtual) {
      idAtual = gerarIdEquipe();
      setIdEquipe(idAtual);
    }

    enviarLocalizacao(idAtual);

    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
    }

    intervaloRef.current = setInterval(() => {
      enviarLocalizacao(idAtual);
    }, 15000);

    alert("Rastreamento iniciado!");
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

    alert("Rastreamento parado!");
  }

  function trocarEquipe() {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
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
    setStatus("Livre");

    alert("Equipe limpa. Você pode cadastrar uma nova equipe.");
  }

  async function registrarHistorico(dados) {
    await addDoc(collection(db, "historico_missoes"), {
      ...dados,
      criadoEm: new Date().toISOString(),
    });
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

    const equipeSelecionada = carros.find((carro) => carro.id === equipeMissao);
    const agora = new Date().toISOString();

    await setDoc(doc(db, "missoes", equipeMissao), {
      texto: missaoTexto.trim(),
      statusOperacional: "Nova missão",
      enviadaEm: agora,
      atualizadoEm: agora,
    });

    await registrarHistorico({
      tipo: "Missão enviada",
      equipeId: equipeMissao,
      motorista: equipeSelecionada?.motorista || "Não informado",
      copiloto: equipeSelecionada?.copiloto || "",
      identificador: equipeSelecionada?.identificador || "",
      texto: missaoTexto.trim(),
      statusOperacional: "Nova missão",
      enviadaEm: agora,
    });

    setMissaoTexto("");
    alert("Missão enviada!");
  }

  async function atualizarStatusMissao(novoStatus) {
    if (!idEquipe) return;

    const agora = new Date().toISOString();

    await updateDoc(doc(db, "missoes", idEquipe), {
      statusOperacional: novoStatus,
      atualizadoEm: agora,
    });

    await registrarHistorico({
      tipo: "Status atualizado",
      equipeId: idEquipe,
      motorista: motorista || "Não informado",
      copiloto,
      identificador,
      texto: missaoAtual?.texto || "Missão não informada",
      statusOperacional: novoStatus,
      atualizadoEm: agora,
    });

    alert(`Status atualizado: ${novoStatus}`);
  }

  const online = carros.filter((c) => c.online).length;
  const emergencia = carros.filter((c) => c.status === "Emergência").length;
  const emMissao = carros.filter((c) => c.status === "Em missão").length;
  const apoio = Object.values(missoes).filter(
    (m) => m.statusOperacional === "🚨 Aguardando apoio"
  ).length;

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>CENTRAL TÁTICA</div>
          <h1 style={styles.title}>OPERAÇÃO CAPIVARA</h1>
          <div style={styles.subtitle}>Controle total da missão</div>
        </div>

        <div style={styles.nav}>
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
            Motorista
          </button>
        </div>
      </header>

      {tela === "central" && (
        <main style={styles.main}>
          <section style={styles.statsGrid}>
            <div style={styles.statCard}>
              <span style={styles.statLabel}>Equipes online</span>
              <strong style={styles.statValue}>{online}</strong>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statLabel}>Em missão</span>
              <strong style={{ ...styles.statValue, color: "#ffd000" }}>
                {emMissao}
              </strong>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statLabel}>Emergências</span>
              <strong style={{ ...styles.statValue, color: "#ff3333" }}>
                {emergencia}
              </strong>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statLabel}>Pedidos de apoio</span>
              <strong style={{ ...styles.statValue, color: "#ff3333" }}>
                {apoio}
              </strong>
            </div>
          </section>

          {apoio > 0 && (
            <section style={styles.alertApoio}>
              🚨 ATENÇÃO: existe equipe aguardando apoio imediato!
            </section>
          )}

          <section style={styles.missionPanel}>
            <div style={styles.panelHeaderClean}>
              <strong>Enviar missão</strong>
              <span>Ordem em tempo real</span>
            </div>

            <select
              value={equipeMissao}
              onChange={(e) => setEquipeMissao(e.target.value)}
              style={styles.inputFull}
            >
              <option value="">Selecione uma equipe</option>
              {carros.map((carro) => (
                <option key={carro.id} value={carro.id}>
                  {carro.motorista} — {carro.identificador || "sem veículo"}
                </option>
              ))}
            </select>

            <textarea
              value={missaoTexto}
              onChange={(e) => setMissaoTexto(e.target.value)}
              placeholder="Digite a missão. Ex: Ir para o setor Garcia buscar item."
              style={styles.textarea}
            />

            <button onClick={enviarMissao} style={styles.startButtonFull}>
              ENVIAR MISSÃO
            </button>
          </section>

          <section style={styles.mapPanelFull}>
            <div style={styles.panelHeader}>
              <strong>Mapa operacional</strong>
              <span>Blumenau / SC — clique na capivara para detalhes</span>
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

                {carros.map((carro) => {
                  const missao = missoes[carro.id];

                  return carro.latitude && carro.longitude ? (
                    <Marker
                      key={carro.id}
                      position={[carro.latitude, carro.longitude]}
                      icon={iconeCapivara}
                    >
                      <Popup>
                        <div style={{ minWidth: 220 }}>
                          <strong>{carro.motorista || "Sem motorista"}</strong>
                          <br />
                          <b>Copiloto:</b> {carro.copiloto || "Não informado"}
                          <br />
                          <b>Veículo:</b>{" "}
                          {carro.identificador || "Sem identificação"}
                          <br />
                          <b>Status:</b> {carro.status || "Sem status"}
                          <br />
                          <b>Online:</b> {carro.online ? "Sim" : "Não"}
                          <br />
                          <br />
                          <b>Missão:</b>{" "}
                          {missao?.texto || "Sem missão ativa"}
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
          </section>

          <section style={styles.historicoPanel}>
            <div style={styles.panelHeaderClean}>
              <strong>Histórico operacional</strong>
              <span>Últimos 20 registros</span>
            </div>

            {historico.length === 0 && (
              <div style={styles.noMission}>Nenhum histórico registrado.</div>
            )}

            {historico.map((item) => (
              <div key={item.id} style={styles.historicoItem}>
                <div>
                  <strong>{item.tipo}</strong>
                  <p>{item.texto}</p>
                  <small>
                    {item.motorista} — {item.identificador || "sem veículo"}
                  </small>
                </div>

                <span
                  style={{
                    ...styles.historicoBadge,
                    background:
                      coresMissao[item.statusOperacional] || "#00ff88",
                  }}
                >
                  {item.statusOperacional}
                </span>

                <small>{formatarData(item.criadoEm)}</small>
              </div>
            ))}
          </section>
        </main>
      )}

      {tela === "motorista" && (
        <main style={styles.driverPage}>
          <section style={styles.driverCard}>
            <div style={styles.panelHeader}>
              <strong>Identificação da equipe</strong>
              <span>GPS a cada 15s</span>
            </div>

            {missaoAtual && (
              <div
                style={{
                  ...styles.missionAlert,
                  borderColor:
                    coresMissao[missaoAtual.statusOperacional] || "#ffd000",
                }}
              >
                <strong>📡 MISSÃO RECEBIDA</strong>
                <p>{missaoAtual.texto}</p>
                <p>
                  <b>Status:</b>{" "}
                  <span
                    style={{
                      color:
                        coresMissao[missaoAtual.statusOperacional] || "#ffd000",
                    }}
                  >
                    {missaoAtual.statusOperacional}
                  </span>
                </p>
                <small>Enviada em: {formatarData(missaoAtual.enviadaEm)}</small>

                <div style={styles.actionGrid}>
                  <button
                    onClick={() => atualizarStatusMissao("Em deslocamento")}
                    style={styles.yellowButton}
                  >
                    🚗 EM DESLOCAMENTO
                  </button>

                  <button
                    onClick={() => atualizarStatusMissao("Missão concluída")}
                    style={styles.startButton}
                  >
                    ✅ CONCLUÍDA
                  </button>

                  <button
                    onClick={() => atualizarStatusMissao("🚨 Aguardando apoio")}
                    style={styles.stopButton}
                  >
                    🚨 PEDIR APOIO
                  </button>
                </div>
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
              placeholder="Nome do copiloto, se tiver"
              style={styles.input}
            />

            <label style={styles.label}>Identificação do veículo</label>
            <input
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              placeholder="Ex: Gol prata, Carro 12, placa final 1234"
              style={styles.input}
            />

            <label style={styles.label}>Status atual</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                ...styles.input,
                borderColor: coresStatus[status] || "#00ff88",
              }}
            >
              <option>Livre</option>
              <option>Em missão</option>
              <option>Apoio</option>
              <option>Emergência</option>
            </select>

            <button onClick={iniciarGPS} style={styles.startButton}>
              INICIAR GPS
            </button>

            <button onClick={pararGPS} style={styles.stopButton}>
              PARAR GPS
            </button>

            <button onClick={trocarEquipe} style={styles.neutralButton}>
              TROCAR EQUIPE
            </button>

            <div style={styles.infoBox}>
              O rastreamento só inicia após clicar em <b>INICIAR GPS</b>. Alertas
              importantes usam vibração no celular.
            </div>
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
    boxShadow: "0 0 30px rgba(0,255,136,0.08)",
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
  missionPanel: {
    background: "rgba(10,18,13,0.9)",
    border: "1px solid rgba(255,208,0,0.35)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  historicoPanel: {
    background: "rgba(10,18,13,0.9)",
    border: "1px solid rgba(0,255,136,0.25)",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  historicoItem: {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    gap: 12,
    alignItems: "center",
    background: "#111a14",
    border: "1px solid rgba(0,255,136,0.18)",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  historicoBadge: {
    color: "#061008",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "bold",
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
  mapBoxFull: {
    height: "68vh",
    minHeight: 520,
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
  actionGrid: {
    marginTop: 10,
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
  missionAlert: {
    margin: 16,
    padding: 14,
    borderRadius: 12,
    background: "rgba(255,208,0,0.15)",
    border: "1px solid #ffd000",
    color: "#fff2a8",
  },
  noMission: {
    marginTop: 10,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#9cffc8",
    fontSize: 13,
  },
};