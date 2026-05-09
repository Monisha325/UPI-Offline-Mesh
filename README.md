# UPI Offline Mesh 

A Spring Boot backend I built to demonstrate **offline UPI payments routed through a Bluetooth-style mesh network**. The core idea: you're in a basement with zero connectivity. You send your friend ₹500. Your phone encrypts the payment, broadcasts it to nearby phones, and the packet hops device-to-device until *some* phone walks outside, gets 4G, and silently uploads it to my backend. The backend decrypts, deduplicates, and settles.

This repo is the **server side** of that system, plus a software simulator of the mesh so the entire flow can be demoed on a single laptop without any real Bluetooth hardware.

---

## Dashboard Preview

<img width="1280" height="1614" alt="image" src="https://github.com/user-attachments/assets/5d76ccbb-47ab-42bf-99b8-28832e447e39" />

---

## Table of Contents

1. [What I built and proved](#what-i-built-and-proved)
2. [How to run it](#how-to-run-it)
3. [The demo flow (step by step)](#the-demo-flow-step-by-step)
4. [Architecture](#architecture)
5. [The three hard problems I solved](#the-three-hard-problems-i-solved)
6. [File-by-file walkthrough](#file-by-file-walkthrough)
7. [API reference](#api-reference)
8. [Tests](#tests)
9. [What's production-ready vs. demo-grade](#whats-production-ready-vs-demo-grade)
10. [Honest limitations of the concept](#honest-limitations-of-the-concept)

---

## What I Built and Proved

My system demonstrates three things working end to end:

1. **A payment can travel from sender to backend through untrusted intermediaries** without any of them being able to read or tamper with it. I achieved this using Hybrid RSA + AES-GCM encryption.
2. **Even if the same payment reaches the backend simultaneously through multiple bridge nodes, it settles exactly once.** I implemented idempotency via atomic compare-and-set on the ciphertext hash.
3. **A tampered or replayed packet is rejected** before it touches the ledger.

All three are visible and interactive in the dashboard I built.

---

## How to Run It

### Prerequisites

- **JDK 17 or newer** installed and on PATH (or `JAVA_HOME` set). Check with `java -version`.
- That's it. No database, no Redis, no Maven installation needed — the wrapper handles it.

### Run on Windows

```cmd
mvnw.cmd spring-boot:run
```

The first run downloads Maven (~10 MB) and all dependencies (~80 MB) — give it a couple of minutes. Subsequent runs start in a few seconds.

### Run on Mac/Linux

```bash
./mvnw spring-boot:run
```

### Open the Dashboard

Once you see `Started UpiMeshApplication in X.XXX seconds`, open:

**http://localhost:8080**

You'll get a dark dashboard with everything needed to drive the demo interactively.

### Stop the Server

`Ctrl+C` in the terminal.

### Run the Tests

```cmd
mvnw.cmd test
```

The key one is `IdempotencyConcurrencyTest` — it fires three threads delivering the same packet simultaneously and asserts that exactly one settles.

---

## The Demo Flow (Step by Step)

My dashboard has four buttons that walk through the full pipeline in sequence:

### Step 1 — Compose a Payment

Choose sender, receiver, amount, PIN. Click **"📤 Inject into Mesh"**.

What my backend actually does:

- It pretends to be the sender's phone.
- It builds a `PaymentInstruction` with a unique nonce and current timestamp.
- It encrypts that with the server's RSA public key (using hybrid encryption — see below).
- It wraps the ciphertext in a `MeshPacket` with a TTL of 5.
- It hands the packet to `phone-alice`, an offline virtual device.

You'll see `phone-alice` now holds 1 packet.

### Step 2 — Run Gossip Rounds

Click **"🔄 Run Gossip Round"**. Click it again.

Each round, every device that holds a packet broadcasts it to every device in Bluetooth range (simulated as everyone). TTL decrements per hop. After 1 round, every device holds the packet. After 2 rounds, still every device — TTL is just lower.

In the real system this happens organically as people walk past each other in the basement.

### Step 3 — Bridge Node Walks Outside

Click **"📡 Bridges Upload to Backend"**.

`phone-bridge` is the only device with `hasInternet=true`. The dashboard simulates that phone walking outside and getting 4G. It POSTs every packet it holds to `/api/bridge/ingest`.

My backend pipeline then runs:

1. Hash the ciphertext (SHA-256).
2. Atomically claim the hash in my idempotency cache.
3. If claimed: decrypt with the server's RSA private key.
4. Verify freshness (`signedAt` within 24 hours).
5. Run the debit/credit inside a single `@Transactional` block.

Watch the Account Balances table — money moves. Watch the Transaction Ledger — a new row appears with status `SETTLED`.

### Step 4 — Demonstrate Idempotency (the Killer Feature)

To see idempotency in action properly, run the concurrency test directly:

```cmd
mvnw.cmd test -Dtest=IdempotencyConcurrencyTest#singlePacketDeliveredByThreeBridgesSettlesExactlyOnce
```

This test creates one packet, fires 3 threads at `BridgeIngestionService.ingest()` simultaneously, and verifies: exactly one `SETTLED`, two `DUPLICATE_DROPPED`, and the sender debited exactly once.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SENDER PHONE (offline)                          │
│  PaymentInstruction { sender, receiver, amount, pinHash, nonce, time }  │
│              │                                                          │
│              ▼ encrypt with server's RSA public key                     │
│   MeshPacket { packetId, ttl, createdAt, ciphertext }                   │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │ Bluetooth gossip
                                       ▼
        ┌─────────┐  hop   ┌─────────┐  hop   ┌─────────┐
        │stranger1│ ─────▶ │stranger2│ ─────▶ │ bridge  │ ◀── walks outside
        └─────────┘        └─────────┘        └────┬────┘     gets 4G
                                                   │
                                                   ▼ HTTPS POST
┌─────────────────────────────────────────────────────────────────────────┐
│                     SPRING BOOT BACKEND (this project)                  │
│                                                                         │
│  /api/bridge/ingest                                                     │
│       │                                                                 │
│       ▼                                                                 │
│  [1] hash ciphertext (SHA-256)                                          │
│       │                                                                 │
│       ▼                                                                 │
│  [2] IdempotencyService.claim(hash)  ◀── atomic putIfAbsent             │
│       │                                  Duplicates rejected here       │
│       ▼                                                                 │
│  [3] HybridCryptoService.decrypt(ciphertext)                            │
│       │       RSA-OAEP unwraps AES key, AES-GCM decrypts payload        │
│       │       and verifies the auth tag — tampering = exception         │
│       ▼                                                                 │
│  [4] Freshness check: signedAt within last 24h                          │
│       │                                                                 │
│       ▼                                                                 │
│  [5] SettlementService.settle()                                         │
│       @Transactional: debit sender, credit receiver, write ledger       │
│       @Version on Account = optimistic locking (defense in depth)       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## The Three Hard Problems I Solved

### Problem 1: Untrusted Intermediaries

A random stranger's phone is carrying someone else's transaction. How do I stop them from reading the amount or changing it?

**My solution: Hybrid encryption (RSA-OAEP + AES-256-GCM).**

The sender encrypts the payload with the server's public key. Only the server holds the private key, so intermediaries see opaque ciphertext. But RSA can only encrypt small data (~245 bytes for a 2048-bit key), and my JSON payload can exceed that. So I used the standard hybrid pattern:

1. Generate a fresh AES-256 key for each packet.
2. Encrypt the JSON with AES-256-GCM (fast + authenticated).
3. Encrypt just the AES key with RSA-OAEP.
4. Concatenate: `[256 bytes RSA-encrypted AES key][12 bytes IV][AES ciphertext + 16-byte GCM tag]`.

The GCM mode provides authenticated encryption. If an intermediate flips a single bit anywhere in the ciphertext, decryption throws an exception — the GCM auth tag will not verify. My server cannot be tricked into processing tampered data. This is the same scheme TLS uses. See `HybridCryptoService.java`.

### Problem 2: The Duplicate-Storm

Three bridge nodes hold the same packet. They all walk outside at the same moment and POST to `/api/bridge/ingest` within milliseconds of each other. Naive processing would debit the sender ₹1500 instead of ₹500.

**My solution: Atomic compare-and-set on the ciphertext hash.**

The very first thing my server does on receiving a packet is compute `SHA-256(ciphertext)` and try to claim that hash:

```java
// IdempotencyService.java
Instant prev = seen.putIfAbsent(packetHash, now);
return prev == null;  // true = first claimer, false = duplicate
```

`ConcurrentHashMap.putIfAbsent` is atomic. Even if 100 threads call it at the exact same nanosecond, exactly one returns `null` (the winner) and the rest return the existing entry. Only the first claimer proceeds to decrypt and settle. The rest are short-circuited as `DUPLICATE_DROPPED`.

I hash the ciphertext rather than the `packetId` (which a malicious node could rewrite) or the cleartext (which requires decryption first). The ciphertext is authenticated by GCM, so two legitimate deliveries of the same packet have byte-identical ciphertexts.

In production, this `ConcurrentHashMap` becomes Redis `SET key NX EX 86400` — same semantics, distributed. I also added a defence-in-depth fallback: a unique index on `transactions.packet_hash` at the database level.

### Problem 3: Replay Attacks

An attacker who captured a ciphertext could replay it later.

**My solution: Two layers.**

1. Inside the encrypted payload, I include `signedAt` (epoch millis). The server rejects any packet older than 24 hours. The attacker cannot change `signedAt` without breaking the GCM tag.
2. Inside the encrypted payload, I include a `nonce` (UUID). If a sender legitimately pays the same person ₹100 twice, the nonces differ → ciphertexts differ → hashes differ → both settle correctly. But a replay of one specific signed packet is byte-identical, so my idempotency cache catches it.

See `BridgeIngestionService.java` for the freshness check implementation.

---

## File-by-File Walkthrough

```
upi-offline-mesh/
├── pom.xml                                  Maven build, Spring Boot 3.3, Java 17
├── mvnw, mvnw.cmd                           Maven wrapper (no install needed)
├── README.md                                this file
└── src/main/
    ├── resources/
    │   ├── application.properties           H2 in-memory DB, port 8080, TTLs
    │   └── templates/dashboard.html         The interactive demo UI I built
    └── java/com/demo/upimesh/
        ├── UpiMeshApplication.java          Spring Boot entry point
        │
        ├── model/                           ── Domain layer
        │   ├── Account.java                 JPA entity; @Version = optimistic lock
        │   ├── AccountRepository.java       Spring Data JPA
        │   ├── Transaction.java             Settled-tx ledger; unique idx on packetHash
        │   ├── TransactionRepository.java   Spring Data JPA
        │   ├── MeshPacket.java              Wire format; outer fields readable, ciphertext opaque
        │   └── PaymentInstruction.java      Decrypted payload (sender/receiver/amount/nonce/time)
        │
        ├── crypto/                          ── Cryptography layer (my core work)
        │   ├── ServerKeyHolder.java         Generates RSA-2048 keypair on startup
        │   └── HybridCryptoService.java     RSA-OAEP + AES-256-GCM encrypt/decrypt + hash
        │
        ├── service/                         ── Business logic
        │   ├── DemoService.java             Seeds accounts, simulates sender phone
        │   ├── VirtualDevice.java           One simulated phone in the mesh
        │   ├── MeshSimulatorService.java    Gossip protocol across virtual devices
        │   ├── IdempotencyService.java      ConcurrentHashMap acting as JVM-local Redis SETNX
        │   ├── SettlementService.java       @Transactional debit + credit + ledger insert
        │   └── BridgeIngestionService.java  THE pipeline: hash → claim → decrypt → freshness → settle
        │
        ├── controller/                      ── HTTP layer
        │   ├── ApiController.java           All REST endpoints
        │   └── DashboardController.java     Serves dashboard HTML at /
        │
        └── config/
            └── AppConfig.java               @EnableScheduling for cache eviction

src/test/java/com/demo/upimesh/
└── IdempotencyConcurrencyTest.java          3-bridges-at-once test + tamper rejection test
```

---

## API Reference

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/` | Dashboard HTML |
| GET | `/api/server-key` | Server's RSA public key (base64) |
| GET | `/api/accounts` | All accounts and balances |
| GET | `/api/transactions` | Last 20 transactions |
| GET | `/api/mesh/state` | Current state of every virtual device |
| POST | `/api/demo/send` | Simulate sender phone — encrypt + inject packet |
| POST | `/api/mesh/gossip` | Run one round of gossip across the mesh |
| POST | `/api/mesh/flush` | Bridges with internet upload to backend (parallel) |
| POST | `/api/mesh/reset` | Clear mesh + idempotency cache |
| POST | `/api/bridge/ingest` | The production endpoint — real bridges POST here |
| GET | `/h2-console` | Browse the in-memory database |

**H2 console login:** JDBC URL `jdbc:h2:mem:upimesh`, username `sa`, no password.

### Request format for `/api/bridge/ingest`

```http
POST /api/bridge/ingest
Content-Type: application/json
X-Bridge-Node-Id: phone-bridge-42
X-Hop-Count: 3

{
  "packetId": "550e8400-e29b-41d4-a716-446655440000",
  "ttl": 2,
  "createdAt": 1730000000000,
  "ciphertext": "base64-encoded-RSA-and-AES-blob"
}
```

**Response:**

```json
{
  "outcome": "SETTLED",
  "packetHash": "a3f8c9...",
  "reason": null,
  "transactionId": 42
}
```

`outcome` is one of `SETTLED`, `DUPLICATE_DROPPED`, or `INVALID`. `reason` is populated on `INVALID`. `transactionId` is populated on `SETTLED`.

---

## Tests

```cmd
mvnw.cmd test
```

My three tests:

| Test | What it verifies |
|------|-----------------|
| `encryptDecryptRoundTrip` | Hybrid encryption is symmetric — what goes in comes out |
| `tamperedCiphertextIsRejected` | Flip one byte in the ciphertext → `INVALID` outcome, no settlement |
| `singlePacketDeliveredByThreeBridgesSettlesExactlyOnce` | 3 threads, 1 packet, simultaneous delivery → exactly 1 `SETTLED`, 2 `DUPLICATE_DROPPED`, sender debited once |

---

## What's Production-Ready vs. Demo-Grade

The cryptography and idempotency logic I wrote is essentially production-shaped. The infrastructure around it is what would change:

| What's in my demo | What it would be in production |
|-------------------|-------------------------------|
| H2 in-memory DB | PostgreSQL / MySQL with replicas |
| `ConcurrentHashMap` for idempotency | Redis `SET NX EX` |
| RSA keypair regenerated on every startup | Private key in HSM (AWS KMS, HashiCorp Vault) |
| `DemoService.createPacket()` runs server-side | Same logic running on Android in Kotlin |
| Software mesh (`MeshSimulatorService`) | Real BLE GATT or Wi-Fi Direct between phones |
| One settlement service owning the ledger | Integration with NPCI / a real bank core |
| No auth on `/api/bridge/ingest` | Mutual TLS or signed bridge-node certificates |
| Seeded in-memory accounts | Real KYC'd users, real VPAs, real PIN verification |
| H2 console exposed | Disabled |
| No rate limiting | Per-bridge-node rate limit, per-sender velocity check |

---

## Honest Limitations of the Concept

I want to be transparent about what this design does not solve — these are inherent to "no internet, anywhere in the chain," not bugs in my implementation:

**Receiver has no offline proof of funds.** When a sender shows "₹500 sent," it's an IOU, not a settled payment. If the sender's account is empty when the packet reaches the backend, settlement is `REJECTED` with no recourse for the receiver. Real offline UPI (UPI Lite) solves this using a pre-funded hardware-backed wallet.

**Double-spend is possible offline.** With ₹500 in their account, a sender could inject a packet for Bob in basement A, then walk to basement B and inject another ₹500 for Carol. Whichever packet hits the backend first wins; the other is rejected. Same root cause as above.

**Real Bluetooth is hard.** Background BLE on Android is heavily throttled since Android 8. iOS peripheral mode is locked down. Reliable stranger-to-stranger connections without active app foreground use is genuinely difficult. My simulator skips this problem entirely.

**Privacy / metadata.** A stranger carries your encrypted packet on their device. They cannot read it, but its existence is metadata. A real deployment would need regulatory disclosures and a clear policy on device seizure.

I'd describe this project honestly as **"mesh-routed deferred settlement"** rather than real-time offline UPI. The cryptography and idempotency engineering here is real and worth scrutiny — the infrastructure around it is what a production version would need.

---

## Troubleshooting

**`java: command not found`** — Install JDK 17+. On Windows: `winget install EclipseAdoptium.Temurin.17.JDK` or download from [adoptium.net](https://adoptium.net).

**Port 8080 already in use** — Change `server.port` in `application.properties`.

**First run hangs** — It's downloading Maven (~10 MB) then dependencies (~80 MB). Allow 2–3 minutes on a normal connection. Subsequent startups take ~5 seconds.

**`mvnw.cmd` not recognised on PowerShell** — Prefix with `.\`: `.\mvnw.cmd spring-boot:run`.

**Tests fail intermittently** — The concurrency test is timing-sensitive. Run it 3× before concluding it's broken. If it consistently fails, share the failure output as a bug report.
