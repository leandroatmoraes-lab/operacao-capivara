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
  iconSize: [32, 32],
});

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

    const numeroUnico = Date.now();

    return `${nomeBase}-${numeroUnico}`;
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
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        await setDoc(doc(db, "carros", idAtual), {
          motorista: motorista.trim(),
          copiloto: copiloto.trim(),
          identificador: identificador.trim(),
          status,
          latitude: lat,
          longitude: lng,
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

  return (
    <div
      style={{
        background: "#0b0f0d",
        minHeight: "100vh",
        color: "#00ff88",
        padding: 20,
        fontFamily: "Arial",
      }}
    >
      <h1>🟢 OPERAÇÃO CAPIVARA</h1>

      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setTela("central")}>Central</button>{" "}
        <button onClick={() => setTela("motorista")}>Motorista</button>
      </div>

      {tela === "central" && (
        <div>
          <h2>Central Tática</h2>
          <p>Total de equipes rastreadas: {carros.length}</p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: 20,
            }}
          >
            <div
              style={{
                height: 500,
                border: "2px solid #00ff88",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
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
                        Atualizado: {carro.atualizado}
                      </Popup>
                    </Marker>
                  ) : null
                )}
              </MapContainer>
            </div>

            <div>
              {carros.map((carro) => (
                <div
                  key={carro.id}
                  style={{
                    background: "#161b18",
                    padding: 15,
                    borderRadius: 10,
                    marginBottom: 10,
                    border: carro.online
                      ? "1px solid #00ff88"
                      : "1px solid #777",
                    opacity: carro.online ? 1 : 0.6,
                  }}
                >
                  <strong>{carro.motorista}</strong>
                  <p>Copiloto: {carro.copiloto || "Não informado"}</p>
                  <p>
                    Identificação:{" "}
                    {carro.identificador || "Sem identificação"}
                  </p>
                  <p>Status: {carro.status}</p>
                  <p>Online: {carro.online ? "Sim" : "Não"}</p>
                  <p>Atualizado: {carro.atualizado}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tela === "motorista" && (
        <div
          style={{
            background: "#161b18",
            padding: 20,
            borderRadius: 10,
            maxWidth: 430,
          }}
        >
          <h2>Equipe do Veículo</h2>

          <p>Motorista:</p>
          <input
            value={motorista}
            onChange={(e) => setMotorista(e.target.value)}
            placeholder="Nome do motorista"
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 15,
              background: "#0b0f0d",
              color: "#00ff88",
              border: "1px solid #00ff88",
            }}
          />

          <p>Copiloto:</p>
          <input
            value={copiloto}
            onChange={(e) => setCopiloto(e.target.value)}
            placeholder="Nome do copiloto, se tiver"
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 15,
              background: "#0b0f0d",
              color: "#00ff88",
              border: "1px solid #00ff88",
            }}
          />

          <p>Identificação do carro:</p>
          <input
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            placeholder="Ex: Gol prata, Carro 12, placa final 1234"
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 20,
              background: "#0b0f0d",
              color: "#00ff88",
              border: "1px solid #00ff88",
            }}
          />

          <p>Status atual:</p>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 20,
              background: "#0b0f0d",
              color: "#00ff88",
              border: "1px solid #00ff88",
            }}
          >
            <option>Livre</option>
            <option>Em missão</option>
            <option>Apoio</option>
            <option>Emergência</option>
          </select>

          <button
            onClick={iniciarGPS}
            style={{
              width: "100%",
              padding: 15,
              background: "#00aa55",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            INICIAR GPS
          </button>

          <button
            onClick={pararGPS}
            style={{
              width: "100%",
              padding: 15,
              background: "#aa0000",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 16,
              marginTop: 10,
            }}
          >
            PARAR GPS
          </button>
        </div>
      )}
    </div>
  );
}