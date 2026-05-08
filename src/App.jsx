import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  onSnapshot,
  updateDoc,
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

export default function App() {
  const [tela, setTela] = useState("central");

  const [status, setStatus] = useState("Livre");
  const [carros, setCarros] = useState([]);

  const [motorista, setMotorista] = useState("");
  const [copiloto, setCopiloto] = useState("");
  const [identificador, setIdentificador] = useState("");

  const [idEquipe, setIdEquipe] = useState("");

  const [missaoTexto, setMissaoTexto] = useState("");
  const [equipeMissao, setEquipeMissao] = useState("");

  const [missaoAtual, setMissaoAtual] = useState(null);

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

  useEffect(() => {
    if (!idEquipe) return;

    const unsubscribe = onSnapshot(doc(db, "missoes", idEquipe), (snapshot) => {
      if (snapshot.exists()) {
        setMissaoAtual(snapshot.data());
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
    navigator.geolocation.getCurrentPosition(async (position) => {
      await setDoc(doc(db, "carros", idAtual), {
        motorista,
        copiloto,
        identificador,
        status,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        atualizado: new Date().toISOString(),
        online: true,
      });
    });
  }

  function iniciarGPS() {
    let idAtual = idEquipe;

    if (!idAtual) {
      idAtual = gerarIdEquipe();
      setIdEquipe(idAtual);
    }

    enviarLocalizacao(idAtual);

    intervaloRef.current = setInterval(() => {
      enviarLocalizacao(idAtual);
    }, 15000);

    alert("GPS iniciado");
  }

  async function pararGPS() {
    clearInterval(intervaloRef.current);

    if (idEquipe) {
      await updateDoc(doc(db, "carros", idEquipe), {
        online: false,
        status: "Offline",
      });
    }

    alert("GPS parado");
  }

  async function enviarMissao() {
    if (!equipeMissao || !missaoTexto) {
      alert("Preencha os campos");
      return;
    }

    await setDoc(doc(db, "missoes", equipeMissao), {
      texto: missaoTexto,
      enviadaEm: new Date().toISOString(),
      statusOperacional: "Nova missão",
    });

    setMissaoTexto("");

    alert("Missão enviada");
  }

  async function atualizarStatusMissao(novoStatus) {
    if (!idEquipe) return;

    await updateDoc(doc(db, "missoes", idEquipe), {
      statusOperacional: novoStatus,
      atualizadoEm: new Date().toISOString(),
    });

    alert(`Status atualizado: ${novoStatus}`);
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1>🟢 OPERAÇÃO CAPIVARA</h1>

        <div style={styles.menu}>
          <button onClick={() => setTela("central")} style={styles.menuBtn}>
            Central
          </button>

          <button onClick={() => setTela("motorista")} style={styles.menuBtn}>
            Motorista
          </button>
        </div>
      </header>

      {tela === "central" && (
        <>
          <div style={styles.card}>
            <h2>📡 Enviar missão</h2>

            <select
              value={equipeMissao}
              onChange={(e) => setEquipeMissao(e.target.value)}
              style={styles.input}
            >
              <option value="">Selecione equipe</option>

              {carros.map((carro) => (
                <option key={carro.id} value={carro.id}>
                  {carro.motorista}
                </option>
              ))}
            </select>

            <textarea
              value={missaoTexto}
              onChange={(e) => setMissaoTexto(e.target.value)}
              placeholder="Digite missão..."
              style={styles.textarea}
            />

            <button onClick={enviarMissao} style={styles.greenBtn}>
              ENVIAR MISSÃO
            </button>
          </div>

          <div style={styles.mapContainer}>
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
                      {carro.identificador}
                    </Popup>
                  </Marker>
                ) : null
              )}
            </MapContainer>
          </div>

          <div style={styles.teamList}>
            {carros.map((carro) => (
              <div key={carro.id} style={styles.teamCard}>
                <strong>{carro.motorista}</strong>

                <p>{carro.identificador}</p>

                <StatusMissao idEquipe={carro.id} />
              </div>
            ))}
          </div>
        </>
      )}

      {tela === "motorista" && (
        <div style={styles.card}>
          <h2>Equipe</h2>

          {missaoAtual && (
            <div style={styles.alertMission}>
              <strong>📡 MISSÃO</strong>

              <p>{missaoAtual.texto}</p>

              <p>
                <b>Status:</b> {missaoAtual.statusOperacional}
              </p>
            </div>
          )}

          <input
            placeholder="Motorista"
            value={motorista}
            onChange={(e) => setMotorista(e.target.value)}
            style={styles.input}
          />

          <input
            placeholder="Copiloto"
            value={copiloto}
            onChange={(e) => setCopiloto(e.target.value)}
            style={styles.input}
          />

          <input
            placeholder="Identificação veículo"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            style={styles.input}
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={styles.input}
          >
            <option>Livre</option>
            <option>Em missão</option>
            <option>Apoio</option>
            <option>Emergência</option>
          </select>

          <button onClick={iniciarGPS} style={styles.greenBtn}>
            INICIAR GPS
          </button>

          <button onClick={pararGPS} style={styles.redBtn}>
            PARAR GPS
          </button>

          {missaoAtual && (
            <>
              <button
                onClick={() =>
                  atualizarStatusMissao("Em deslocamento")
                }
                style={styles.yellowBtn}
              >
                🚗 EM DESLOCAMENTO
              </button>

              <button
                onClick={() =>
                  atualizarStatusMissao("Missão concluída")
                }
                style={styles.greenBtn}
              >
                ✅ MISSÃO CONCLUÍDA
              </button>

              <button
                onClick={() =>
                  atualizarStatusMissao("🚨 Aguardando apoio")
                }
                style={styles.redBtn}
              >
                🚨 PEDIR APOIO
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusMissao({ idEquipe }) {
  const [missao, setMissao] = useState(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "missoes", idEquipe), (snapshot) => {
      if (snapshot.exists()) {
        setMissao(snapshot.data());
      }
    });

    return () => unsubscribe();
  }, [idEquipe]);

  if (!missao) return <p>Sem missão</p>;

  return (
    <div style={styles.statusBox}>
      <p>
        <b>Missão:</b> {missao.texto}
      </p>

      <p>
        <b>Status:</b> {missao.statusOperacional}
      </p>
    </div>
  );
}

const styles = {
  app: {
    background: "#08110b",
    minHeight: "100vh",
    color: "#d8ffe8",
    padding: 20,
    fontFamily: "Arial",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  menu: {
    display: "flex",
    gap: 10,
  },

  menuBtn: {
    padding: 10,
    background: "#102017",
    border: "1px solid #00ff88",
    color: "#fff",
    borderRadius: 8,
    cursor: "pointer",
  },

  card: {
    background: "#102017",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },

  input: {
    width: "100%",
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    border: "1px solid #00ff88",
    background: "#08110b",
    color: "#fff",
    boxSizing: "border-box",
  },

  textarea: {
    width: "100%",
    height: 80,
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    border: "1px solid #00ff88",
    background: "#08110b",
    color: "#fff",
    boxSizing: "border-box",
  },

  greenBtn: {
    width: "100%",
    padding: 14,
    background: "#00aa55",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    marginBottom: 10,
    fontWeight: "bold",
  },

  redBtn: {
    width: "100%",
    padding: 14,
    background: "#aa0000",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    marginBottom: 10,
    fontWeight: "bold",
  },

  yellowBtn: {
    width: "100%",
    padding: 14,
    background: "#d4a000",
    color: "#000",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    marginBottom: 10,
    fontWeight: "bold",
  },

  mapContainer: {
    height: 450,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20,
  },

  teamList: {
    display: "grid",
    gap: 12,
  },

  teamCard: {
    background: "#102017",
    padding: 16,
    borderRadius: 12,
    borderLeft: "5px solid #00ff88",
  },

  statusBox: {
    marginTop: 10,
    padding: 10,
    background: "#08110b",
    borderRadius: 8,
  },

  alertMission: {
    background: "#3b3000",
    border: "1px solid #ffd000",
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
  },
};