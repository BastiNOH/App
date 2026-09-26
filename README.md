# Barcode Bridge

Verwandelt ein **Android-Handy** per Kamera in einen Barcode-Scanner für den PC –
ganz ohne zusätzliche App aus einem Store. Das Handy scannt im Browser (als
installierbare PWA), der PC empfängt die Scans in Echtzeit über das lokale WLAN.

## Wie es funktioniert

```
[Android-Handy]  --Kamera-Scan (html5-qrcode)-->  [Node-Server im WLAN]  --Socket.IO-->  [PC-Browser / PC-Agent]
```

1. Auf dem PC läuft ein kleiner Node-Server (`server/index.js`). Er dient zwei Seiten aus:
   - **`/receiver`** – Empfänger-Seite für den PC-Browser mit Pairing-QR-Code und Scan-Verlauf.
   - **`/scanner`** – Scanner-Seite fürs Handy, nutzt die Kamera zum Erkennen von Barcodes/QR-Codes.
2. PC und Handy koppeln sich über einen 6-stelligen Raumcode (per QR-Code oder manueller Eingabe).
3. Jeder gescannte Code wird sofort per WebSocket an den PC gesendet und dort:
   - in ein Eingabefeld der Empfänger-Seite eingetragen (inkl. simulierter Enter-Taste), und/oder
   - über den optionalen **PC-Agent** systemweit in die gerade aktive Anwendung getippt – genau wie ein
     echter USB-Barcode-Scanner.

## Voraussetzungen

- Node.js ≥ 18 auf dem PC
- PC und Handy im selben WLAN
- Android-Handy mit Chrome (getestet für Chrome; andere moderne Android-Browser sollten ebenfalls funktionieren)

## Start

```bash
npm install
npm start
```

Der Server gibt beim Start die erreichbaren Adressen aus, z. B.:

```
https://localhost:3443/receiver
https://192.168.1.23:3443/receiver
```

Öffne die `https://<PC-IP>:3443/receiver`-Adresse im **PC-Browser**.

> Kamerazugriff im mobilen Browser erfordert eine sichere Verbindung (HTTPS). Der Server
> erzeugt dafür beim ersten Start automatisch ein selbstsigniertes Zertifikat
> (`certs/`). Beim ersten Öffnen auf dem Handy zeigt Chrome eine Sicherheitswarnung
> ("Nicht sicher" / "Erweitert" → "Trotzdem fortfahren") – das ist normal und muss
> einmalig bestätigt werden, danach funktioniert die Kamera.

### Handy koppeln

1. Auf der PC-Empfänger-Seite erscheint ein QR-Code und ein 6-stelliger Code.
2. Auf dem Handy: QR-Code mit der Kamera-App scannen (öffnet die Scanner-Seite automatisch)
   **oder** manuell `https://<PC-IP>:3443/scanner` öffnen und den Code eingeben.
3. Kamerazugriff erlauben. Sobald "Verbunden mit PC – bereit zum Scannen" angezeigt wird,
   kann losgescannt werden.
4. Jeder erkannte Code erscheint sofort auf dem PC-Bildschirm im Verlauf und im Eingabefeld.

Die Scanner-Seite ist eine PWA (`manifest.json`) und kann auf Android über
"Zum Startbildschirm hinzufügen" wie eine echte App installiert werden.

### Unterstützte Formate

QR-Code, EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93, Codabar, ITF, Data Matrix
(via [html5-qrcode](https://github.com/mebjas/html5-qrcode)).

## Optional: Systemweites Eintippen (PC-Agent)

Standardmäßig landen Scans nur im Eingabefeld der Empfänger-Webseite. Wer die Codes wie bei
einem echten USB-Scanner **in jede beliebige Anwendung** (Excel, Warenwirtschaft, Kassensystem, …)
eintippen lassen möchte, kann zusätzlich den PC-Agent lokal starten:

```bash
cd pc-agent
npm install
node agent.js --url https://localhost:3443 --room ABCD12 --insecure
```

- `--room` ist der auf der Empfänger-Seite angezeigte Code (derselbe Raum wie der Browser-Receiver;
  beide können parallel verbunden sein).
- `--insecure` wird benötigt, weil das Server-Zertifikat selbstsigniert ist.
- `--no-enter` unterdrückt die simulierte Enter-Taste nach jedem Scan.

Der Agent nutzt [`@nut-tree/nut-js`](https://github.com/nut-tree/nut.js) zur Tastatur-Simulation
und muss **auf dem PC selbst** installiert/ausgeführt werden (nicht in dieser Cloud-Umgebung –
hier gibt es keinen Desktop, an den getippt werden könnte).

## Architektur / Dateien

```
server/index.js        Express + Socket.IO Server, Raum-Pairing, Zertifikat, QR-Erzeugung
server/test/relay.test.js  Automatisierter Test der Pairing-/Relay-Logik
public/receiver.html/js Empfänger-Oberfläche für den PC-Browser
public/scanner.html/js  Scanner-Oberfläche fürs Handy (Kamera via html5-qrcode)
pc-agent/agent.js       Optionaler Agent für systemweite Tastatureingabe
```

## Getestet vs. nicht getestet

In dieser Umgebung automatisiert geprüft:
- Server-Relay-Logik (Raum erzeugen, Pairing, Weiterleitung von Scan-Events, Fehlerfälle) – `npm test`
- Vollständiger End-to-End-Fluss der Empfänger-Oberfläche (Pairing-Status, Live-Update von
  Eingabefeld/Verlauf) per Headless-Browser, mit einem simulierten "Scanner"-Client anstelle
  einer echten Kamera.

**Nicht getestet werden konnte** die echte Kamera-Erkennung auf einem physischen Android-Gerät
(diese Cloud-Umgebung hat keine Kamera/kein Telefon). Die Scanner-Seite nutzt die etablierte
Bibliothek html5-qrcode, sollte aber beim ersten echten Einsatz auf dem Handy kurz überprüft werden.
