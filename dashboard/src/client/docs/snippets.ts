import { COMMAND_ID, DEVICE_ID, SAMPLE_IMEI } from './api-spec';

export type Lang = 'curl' | 'node' | 'python' | 'php';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
];

type Req = {
  method: 'GET' | 'POST';
  /** Path with real values already substituted, e.g. `/devices/abc/lock`. */
  path: string;
  body?: Record<string, unknown>;
};

const json = (o: unknown) => JSON.stringify(o, null, 2);

/** One request in the chosen language. `base` is the full base URL including `/partner`. */
export function requestSnippet(lang: Lang, base: string, r: Req): string {
  const url = `${base}${r.path}`;
  switch (lang) {
    case 'curl':
      return [
        `curl ${r.method === 'POST' ? '-X POST ' : ''}"${url}" \\`,
        `  -H "Authorization: Bearer $DEVICELOCK_KEY"${r.body ? ' \\' : ''}`,
        ...(r.body
          ? [`  -H "Content-Type: application/json" \\`, `  -d '${JSON.stringify(r.body)}'`]
          : []),
      ].join('\n');
    case 'node':
      return [
        `const res = await fetch("${url}", {`,
        ...(r.method === 'POST' ? [`  method: "POST",`] : []),
        `  headers: {`,
        `    Authorization: \`Bearer \${process.env.DEVICELOCK_KEY}\`,`,
        ...(r.body ? [`    "Content-Type": "application/json",`] : []),
        `  },`,
        ...(r.body ? [`  body: JSON.stringify(${json(r.body).replace(/\n/g, '\n  ')}),`] : []),
        `});`,
        `const data = await res.json();`,
        `if (!res.ok) throw new Error(\`\${res.status}: \${data.message}\`);`,
      ].join('\n');
    case 'python':
      return [
        `import os, requests`,
        ``,
        `res = requests.${r.method.toLowerCase()}(`,
        `    "${url}",`,
        `    headers={"Authorization": f"Bearer {os.environ['DEVICELOCK_KEY']}"},`,
        ...(r.body ? [`    json=${pyDict(r.body)},`] : []),
        `    timeout=15,`,
        `)`,
        `data = res.json()`,
        `res.raise_for_status()`,
      ].join('\n');
    case 'php':
      return [
        `<?php`,
        `$ch = curl_init("${url}");`,
        `curl_setopt_array($ch, [`,
        `    CURLOPT_RETURNTRANSFER => true,`,
        `    CURLOPT_TIMEOUT => 15,`,
        ...(r.method === 'POST' ? [`    CURLOPT_POST => true,`] : []),
        `    CURLOPT_HTTPHEADER => [`,
        `        "Authorization: Bearer " . getenv("DEVICELOCK_KEY"),`,
        ...(r.body ? [`        "Content-Type: application/json",`] : []),
        `    ],`,
        ...(r.body ? [`    CURLOPT_POSTFIELDS => json_encode(${phpArray(r.body)}),`] : []),
        `]);`,
        `$data = json_decode(curl_exec($ch), true);`,
        `$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);`,
        `if ($status >= 400) { throw new Exception("$status: " . json_encode($data["message"])); }`,
      ].join('\n');
  }
}

function pyDict(o: Record<string, unknown>): string {
  const inner = Object.entries(o).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`);
  return `{${inner.join(', ')}}`;
}

function phpArray(o: Record<string, unknown>): string {
  const inner = Object.entries(o).map(([k, v]) => `"${k}" => ${JSON.stringify(v)}`);
  return `[${inner.join(', ')}]`;
}

/** Complete first integration: look up a phone by IMEI, lock it, then check the command. */
export function quickstartSnippet(lang: Lang, base: string): string {
  const reason = 'Quickstart test';
  const key = 'quickstart-lock-0001';
  switch (lang) {
    case 'curl':
      return [
        `export DEVICELOCK_KEY="dlk_live_..."          # the key you just created`,
        ``,
        `# 1. Find the phone`,
        `curl "${base}/devices/lookup?imei=${SAMPLE_IMEI}" \\`,
        `  -H "Authorization: Bearer $DEVICELOCK_KEY"`,
        ``,
        `# 2. Lock it (use the "id" from step 1)`,
        `curl -X POST "${base}/devices/${DEVICE_ID}/lock" \\`,
        `  -H "Authorization: Bearer $DEVICELOCK_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"reason":"${reason}","idempotencyKey":"${key}"}'`,
        ``,
        `# 3. Check progress (use the "id" from step 2)`,
        `curl "${base}/commands/${COMMAND_ID}" \\`,
        `  -H "Authorization: Bearer $DEVICELOCK_KEY"`,
      ].join('\n');
    case 'node':
      return [
        `// Node 18+ (built-in fetch). Run: DEVICELOCK_KEY=dlk_live_... node quickstart.mjs`,
        `const BASE = "${base}";`,
        `const headers = {`,
        `  Authorization: \`Bearer \${process.env.DEVICELOCK_KEY}\`,`,
        `  "Content-Type": "application/json",`,
        `};`,
        ``,
        `async function call(path, init = {}) {`,
        `  const res = await fetch(BASE + path, { headers, ...init });`,
        `  const data = await res.json();`,
        `  if (!res.ok) throw new Error(\`\${res.status}: \${data.message}\`);`,
        `  return data;`,
        `}`,
        ``,
        `// 1. Find the phone`,
        `const device = await call("/devices/lookup?imei=${SAMPLE_IMEI}");`,
        `console.log("status:", device.status);`,
        ``,
        `// 2. Lock it`,
        `const command = await call(\`/devices/\${device.id}/lock\`, {`,
        `  method: "POST",`,
        `  body: JSON.stringify({ reason: "${reason}", idempotencyKey: "${key}" }),`,
        `});`,
        ``,
        `// 3. Check progress (in production, wait for the device.locked webhook instead)`,
        `console.log(await call(\`/commands/\${command.id}\`));`,
      ].join('\n');
    case 'python':
      return [
        `# pip install requests   |   DEVICELOCK_KEY=dlk_live_... python quickstart.py`,
        `import os, requests`,
        ``,
        `BASE = "${base}"`,
        `session = requests.Session()`,
        `session.headers["Authorization"] = f"Bearer {os.environ['DEVICELOCK_KEY']}"`,
        ``,
        `def call(method, path, **kw):`,
        `    res = session.request(method, BASE + path, timeout=15, **kw)`,
        `    data = res.json()`,
        `    if not res.ok:`,
        `        raise RuntimeError(f"{res.status_code}: {data['message']}")`,
        `    return data`,
        ``,
        `# 1. Find the phone`,
        `device = call("GET", "/devices/lookup", params={"imei": "${SAMPLE_IMEI}"})`,
        `print("status:", device["status"])`,
        ``,
        `# 2. Lock it`,
        `command = call("POST", f"/devices/{device['id']}/lock",`,
        `               json={"reason": "${reason}", "idempotencyKey": "${key}"})`,
        ``,
        `# 3. Check progress (in production, wait for the device.locked webhook instead)`,
        `print(call("GET", f"/commands/{command['id']}"))`,
      ].join('\n');
    case 'php':
      return [
        `<?php`,
        `// DEVICELOCK_KEY=dlk_live_... php quickstart.php`,
        `const BASE = "${base}";`,
        ``,
        `function call(string $method, string $path, ?array $body = null): array {`,
        `    $ch = curl_init(BASE . $path);`,
        `    $headers = ["Authorization: Bearer " . getenv("DEVICELOCK_KEY")];`,
        `    $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CUSTOMREQUEST => $method];`,
        `    if ($body !== null) {`,
        `        $headers[] = "Content-Type: application/json";`,
        `        $opts[CURLOPT_POSTFIELDS] = json_encode($body);`,
        `    }`,
        `    $opts[CURLOPT_HTTPHEADER] = $headers;`,
        `    curl_setopt_array($ch, $opts);`,
        `    $data = json_decode(curl_exec($ch), true);`,
        `    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);`,
        `    if ($status >= 400) { throw new Exception("$status: " . json_encode($data["message"])); }`,
        `    return $data;`,
        `}`,
        ``,
        `// 1. Find the phone`,
        `$device = call("GET", "/devices/lookup?imei=${SAMPLE_IMEI}");`,
        `echo "status: " . $device["status"] . "\\n";`,
        ``,
        `// 2. Lock it`,
        `$command = call("POST", "/devices/" . $device["id"] . "/lock",`,
        `    ["reason" => "${reason}", "idempotencyKey" => "${key}"]);`,
        ``,
        `// 3. Check progress (in production, wait for the device.locked webhook instead)`,
        `print_r(call("GET", "/commands/" . $command["id"]));`,
      ].join('\n');
  }
}

/** A webhook receiver that verifies the signature on the raw body and de-duplicates. */
export function webhookSnippet(lang: Lang): string {
  switch (lang) {
    case 'curl':
    case 'node':
      return [
        `// Express. Use express.raw so the body is the exact bytes we signed.`,
        `import express from "express";`,
        `import crypto from "node:crypto";`,
        ``,
        `const SECRET = process.env.DEVICELOCK_WEBHOOK_SECRET;`,
        `const seen = new Set(); // use a database or Redis in production`,
        ``,
        `function verify(rawBody, header, secret) {`,
        `  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));`,
        `  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;`,
        `  const mac = crypto.createHmac("sha256", secret)`,
        `    .update(\`\${parts.t}.\${rawBody}\`).digest("hex");`,
        `  return mac.length === parts.v1.length &&`,
        `    crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(parts.v1));`,
        `}`,
        ``,
        `const app = express();`,
        `app.post("/hooks/devicelock", express.raw({ type: "application/json" }), (req, res) => {`,
        `  const raw = req.body.toString("utf8");`,
        `  if (!verify(raw, req.get("X-DeviceLock-Signature") ?? "", SECRET)) {`,
        `    return res.sendStatus(400);`,
        `  }`,
        `  const event = JSON.parse(raw);`,
        `  res.sendStatus(200);                  // acknowledge fast, then work`,
        `  if (seen.has(event.id)) return;       // retries repeat the same id`,
        `  seen.add(event.id);`,
        `  if (event.type === "device.locked") { /* mark the loan's phone as locked */ }`,
        `  if (event.type === "device.unlocked") { /* ... */ }`,
        `  if (event.type === "command.failed") { /* alert, or retry later */ }`,
        `});`,
        `app.listen(3000);`,
      ].join('\n');
    case 'python':
      return [
        `# Flask`,
        `import hashlib, hmac, os, time`,
        `from flask import Flask, request`,
        ``,
        `SECRET = os.environ["DEVICELOCK_WEBHOOK_SECRET"].encode()`,
        `seen = set()  # use a database or Redis in production`,
        `app = Flask(__name__)`,
        ``,
        `def verify(raw: bytes, header: str) -> bool:`,
        `    parts = dict(p.split("=", 1) for p in header.split(","))`,
        `    if abs(time.time() - int(parts["t"])) > 300:`,
        `        return False`,
        `    mac = hmac.new(SECRET, parts["t"].encode() + b"." + raw, hashlib.sha256).hexdigest()`,
        `    return hmac.compare_digest(mac, parts["v1"])`,
        ``,
        `@app.post("/hooks/devicelock")`,
        `def hook():`,
        `    raw = request.get_data()  # the exact bytes we signed`,
        `    if not verify(raw, request.headers.get("X-DeviceLock-Signature", "")):`,
        `        return "", 400`,
        `    event = request.get_json()`,
        `    if event["id"] not in seen:          # retries repeat the same id`,
        `        seen.add(event["id"])`,
        `        if event["type"] == "device.locked":`,
        `            pass  # mark the loan's phone as locked`,
        `        elif event["type"] == "command.failed":`,
        `            pass  # alert, or retry later`,
        `    return "", 200`,
      ].join('\n');
    case 'php':
      return [
        `<?php`,
        `$secret = getenv("DEVICELOCK_WEBHOOK_SECRET");`,
        `$raw = file_get_contents("php://input");           // the exact bytes we signed`,
        `$header = $_SERVER["HTTP_X_DEVICELOCK_SIGNATURE"] ?? "";`,
        ``,
        `function verify(string $raw, string $header, string $secret): bool {`,
        `    parse_str(str_replace(",", "&", $header), $p);`,
        `    if (!isset($p["t"], $p["v1"]) || abs(time() - (int)$p["t"]) > 300) return false;`,
        `    $mac = hash_hmac("sha256", $p["t"] . "." . $raw, $secret);`,
        `    return hash_equals($mac, $p["v1"]);`,
        `}`,
        ``,
        `if (!verify($raw, $header, $secret)) { http_response_code(400); exit; }`,
        ``,
        `$event = json_decode($raw, true);`,
        `http_response_code(200);                            // acknowledge fast, then work`,
        `// De-duplicate on $event["id"] (retries repeat it) using your database.`,
        `switch ($event["type"]) {`,
        `    case "device.locked":   /* mark the loan's phone as locked */ break;`,
        `    case "device.unlocked": /* ... */ break;`,
        `    case "command.failed":  /* alert, or retry later */ break;`,
        `}`,
      ].join('\n');
  }
}

/** Substitute `{id}` etc. with the sample values used in examples. */
export function samplePath(path: string, query?: Record<string, string>): string {
  const p = path
    .replace('/commands/{id}', `/commands/${COMMAND_ID}`)
    .replace('{id}', DEVICE_ID);
  const q = query ? '?' + new URLSearchParams(query).toString() : '';
  return p + q;
}
