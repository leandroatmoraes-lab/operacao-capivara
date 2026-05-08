import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
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

const iconeCarro = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/744/744465.png",
  iconSize: [34, 34],
});

const coresStatus = {
  Livre: "#00ff88",
  "Em missão": "#ffd000",
  Apoio: "#00aaff",
  Emergência: "#ff3333",
  Offline: "#777",
};

export default function App() {
  const [tela, setTela] = useState("central");
  const [status, setStatus] = useState("Livre");
  const [carros, setCarros] = useState([]);

  const [motorista, setMotorista] = useState("");
  const [copiloto, setCopiloto] = useState("");
  const [identificador, setIdentificador] = useState("");
  const [idEquipe, setIdEquipe] = useState("");

  const intervaloRef = useRef(null);

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

        console.log("Localização enviada:", idAtual);
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

  const online = carros.filter((c) => c.online).length;
  const emergencia = carros.filter((c) => c.status === "Emergência").length;
  const emMissao = carros.filter((c) => c.status === "Em missão").length;

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
              <span style={styles.statLabel}>Total no radar</span>
              <strong style={styles.statValue}>{carros.length}</strong>
            </div>
          </section>

          <section style={styles.centralGrid}>
            <div style={styles.mapPanel}>
              <div style={styles.panelHeader}>
                <strong>Mapa operacional</strong>
                <span>Blumenau / SC</span>
              </div>

              <div style={styles.mapBox}>
                <MapContainer
                  center={[-26.9167, -49.0667]}
                  zoom={13}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {carros.map((carro) =>
                    carro.latitude && carro.longitude ? (
                      <Marker
                        key={carro.id}
                        position={[carro.latitude, carro.longitude]}
                        icon={iconeCarro}
                      >
                        <Popup>
                          <strong>{carro.motorista}</strong>
                          <br />
                          Copiloto: {carro.copiloto || "Não informado"}
                          <br />
                          Identificação:{" "}
                          {carro.identificador || "Sem identificação"}
                          <br />
                          Status: {carro.status}
                          <br />
                          Online: {carro.online ? "Sim" : "Não"}
                          <br />
                          Atualizado: {formatarData(carro.atualizado)}
                        </Popup>
                      </Marker>
                    ) : null
                  )}
                </MapContainer>
              </div>
            </div>

            <aside style={styles.listPanel}>
              <div style={styles.panelHeader}>
                <strong>Equipes no radar</strong>
                <span>{carros.length} registros</span>
              </div>

              <div style={styles.teamList}>
                {carros.length === 0 && (
                  <div style={styles.empty}>Nenhuma equipe rastreada.</div>
                )}

                {carros.map((carro) => (
                  <div
                    key={carro.id}
                    style={{
                      ...styles.teamCard,
                      borderColor: coresStatus[carro.status] || "#00ff88",
                      opacity: carro.online ? 1 : 0.55,
                    }}
                  >
                    <div style={styles.teamTop}>
                      <strong>{carro.motorista || "Sem nome"}</strong>
                      <span
                        style={{
                          ...styles.badge,
                          background: coresStatus[carro.status] || "#00ff88",
                        }}
                      >
                        {carro.status || "Sem status"}
                      </span>
                    </div>

                    <p>Copiloto: {carro.copiloto || "Não informado"}</p>
                    <p>
                      Veículo: {carro.identificador || "Sem identificação"}
                    </p>
                    <p>Online: {carro.online ? "Sim" : "Não"}</p>
                    <small>Atualizado: {formatarData(carro.atualizado)}</small>
                  </div>
                ))}
              </div>
            </aside>
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

            <div style={styles.infoBox}>
              O rastreamento só inicia após clicar em <b>INICIAR GPS</b> e pode
              ser encerrado a qualquer momento.
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
  centralGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 16,
  },
  mapPanel: {
    background: "rgba(10,18,13,0.9)",
    border: "1px solid rgba(0,255,136,0.25)",
    borderRadius: 16,
    overflow: "hidden",
  },
  listPanel: {
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
  mapBox: {
    height: 560,
  },
  teamList: {
    padding: 12,
    maxHeight: 560,
    overflowY: "auto",
  },
  teamCard: {
    background: "#111a14",
    border: "1px solid #00ff88",
    borderLeft: "6px solid #00ff88",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  teamTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  badge: {
    color: "#061008",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "bold",
  },
  empty: {
    padding: 20,
    color: "#9cffc8",
    textAlign: "center",
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