// M0 spike — one screen. Run the suite accelerated and on CPU, check tokenizer
// parity, read the verdict against the mobile-m0-spike.md §6 thresholds.
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { runSuite, runTokenizerParity, SuiteResult } from "./src/bench";
import { accelEp } from "./src/onnx";

type Flag = "✅" | "⚠️" | "❌";
const flag = (v: number, pass: number, border: number): Flag =>
  v <= pass ? "✅" : v <= border ? "⚠️" : "❌";

// §6 thresholds (ms).
const TH = {
  embed200: [20000, 60000],
  embed1: [150, 500],
  rerank20: [1000, 3000],
  coldLoad: [3000, 10000],
} as const;

export default function App() {
  const [busy, setBusy] = useState(false);
  const [accel, setAccel] = useState<SuiteResult | null>(null);
  const [cpu, setCpu] = useState<SuiteResult | null>(null);
  const [tokMatch, setTokMatch] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(String(e instanceof Error ? e.stack ?? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <StatusBar style="auto" />
      <Text style={styles.h1}>PharmaGuide M0 Spike</Text>
      <Text style={styles.sub}>
        On-device inference feasibility — accel EP: {accelEp()}
      </Text>

      <Btn label={`Run accelerated (${accelEp()})`} disabled={busy}
        onPress={() => guard(async () => setAccel(await runSuite("accel")))} />
      <Btn label="Run CPU only" disabled={busy}
        onPress={() => guard(async () => setCpu(await runSuite("cpu")))} />
      <Btn label="Check tokenizer parity" disabled={busy}
        onPress={() => guard(async () => setTokMatch(await runTokenizerParity()))} />

      {busy && <ActivityIndicator style={{ marginVertical: 16 }} />}
      {err && <Text style={styles.err}>{err}</Text>}

      <Result title={`Accelerated (${accelEp()})`} r={accel} />
      <Result title="CPU" r={cpu} />

      {accel && cpu && (
        <Text style={styles.row}>
          Accel vs CPU (embed×200):{" "}
          {(cpu.embed200Ms / accel.embed200Ms).toFixed(2)}× faster{" "}
          {cpu.embed200Ms > accel.embed200Ms * 1.2 ? "✅" : "⚠️ accel not clearly faster"}
        </Text>
      )}

      {tokMatch !== null && (
        <Text style={styles.row}>
          Tokenizer ids match Python: {tokMatch ? "✅ yes" : "❌ MISMATCH"}
        </Text>
      )}

      <Text style={styles.note}>
        Peak memory is not measured in-app (unreliable in RN) — capture it with
        Xcode Instruments / Android Studio Memory Profiler during the runs.
      </Text>
    </ScrollView>
  );
}

function Result({ title, r }: { title: string; r: SuiteResult | null }) {
  if (!r) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Line k="Cold model load" v={r.coldLoadMs} th={TH.coldLoad} />
      <Line k="Embed ×1 (query)" v={r.embed1Ms} th={TH.embed1} />
      <Line k="Embed ×200 (ingest)" v={r.embed200Ms} th={TH.embed200} />
      <Line k="Rerank ×20" v={r.rerank20Ms} th={TH.rerank20} />
    </View>
  );
}

function Line({ k, v, th }: { k: string; v: number; th: readonly [number, number] }) {
  return (
    <Text style={styles.row}>
      {flag(v, th[0], th[1])} {k}: {v} ms
    </Text>
  );
}

function Btn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, disabled && styles.btnOff, pressed && styles.btnDown]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingTop: 64, gap: 10 },
  h1: { fontSize: 22, fontWeight: "700" },
  sub: { color: "#555", marginBottom: 8 },
  btn: { backgroundColor: "#1f6feb", padding: 14, borderRadius: 10, alignItems: "center" },
  btnDown: { opacity: 0.7 },
  btnOff: { backgroundColor: "#9bb7e3" },
  btnText: { color: "white", fontWeight: "600" },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, marginTop: 8 },
  cardTitle: { fontWeight: "700", marginBottom: 6 },
  row: { fontSize: 15, paddingVertical: 2, fontVariant: ["tabular-nums"] },
  note: { color: "#777", fontSize: 12, marginTop: 16 },
  err: { color: "#b00020", fontFamily: "Courier", fontSize: 12 },
});
