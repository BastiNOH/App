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
   - bei aktiviertem Schalter "systemweit tippen" **direkt vom Server selbst** in die gerade aktive
     Anwendung auf diesem PC getippt – genau wie ein echter USB-Barcode-Scanner, ganz ohne zweiten
     Prozess oder manuelle Konfiguration.

## Voraussetzungen

- Node.js ≥ 18 auf dem PC
- PC und Handy im selben WLAN
- Android-Handy mit Chrome (getestet für Chrome; andere moderne Android-Browser sollten ebenfalls funktionieren)

## Start

### Windows: einfach `start.bat` doppelklicken

Im Projektordner die Datei **`start.bat`** doppelklicken. Beim ersten Mal installiert sie
automatisch alle Abhängigkeiten (dauert etwas), startet danach den Server und öffnet den
Browser automatisch auf der Empfänger-Seite. Das Konsolenfenster muss offen bleiben,
solange die App läuft – schließen beendet den Server. Für einen schnellen Zugriff kannst du
dir eine Verknüpfung von `start.bat` auf den Desktop legen (Rechtsklick → Senden an →
Desktop (Verknüpfung erstellen)).

### Alternativ manuell (Windows/Mac/Linux)

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

## Systemweites Eintippen in andere Programme

Standardmäßig landen Scans nur im Eingabefeld der Empfänger-Webseite. Auf der Empfänger-Seite
gibt es zusätzlich den Schalter **"Auch systemweit in die aktive Anwendung tippen"** – einmal
aktiviert, tippt der Server jeden Scan direkt in das Fenster, das auf **diesem PC** gerade den
Fokus hat (Excel, Warenwirtschaft, Kassensystem, …), inklusive Enter-Taste, genau wie ein echter
USB-Barcode-Scanner. Kein zweiter Prozess, kein Raumcode manuell eintippen – einfach Häkchen
setzen.

Dafür wird beim `npm install` automatisch versucht,
[`@nut-tree-fork/nut-js`](https://github.com/nut-tree-fork/nut.js) mitzuinstallieren (steht als
optionale Abhängigkeit in `package.json`). Klappt das auf einem System nicht (z. B. weil kein
natives Modul für die Plattform verfügbar ist), bleibt der Schalter einfach ausgegraut mit einem
Hinweistext – der Rest der App läuft trotzdem normal.

### Falls die Codes auf einem *anderen* PC getippt werden sollen (PC-Agent)

Der eingebaute Schalter tippt immer auf dem PC, auf dem der Server läuft. Soll stattdessen ein
**anderer** Rechner die Tastatureingaben bekommen (Server läuft z. B. auf PC A, getippt werden
soll auf PC B), gibt es dafür den separaten `pc-agent/`:

```bash
cd pc-agent
npm install
node agent.js --url https://<Server-IP>:3443 --room ABCD12 --insecure
```

- `--room` ist der auf der Empfänger-Seite angezeigte Code.
- `--insecure` wird benötigt, weil das Server-Zertifikat selbstsigniert ist.
- `--no-enter` unterdrückt die simulierte Enter-Taste nach jedem Scan.

## Architektur / Dateien

```
start.bat               Windows-Doppelklick-Start (Installation + Server + Browser)
server/index.js         Express + Socket.IO Server, Raum-Pairing, Zertifikat, QR-Erzeugung
server/system-typist.js Systemweites Tippen (nut.js), optional & mit eigener Warteschlange
server/test/relay.test.js  Automatisierter Test der Pairing-/Relay-Logik
public/receiver.html/js Empfänger-Oberfläche für den PC-Browser
public/scanner.html/js  Scanner-Oberfläche fürs Handy (Kamera via html5-qrcode)
pc-agent/agent.js       Agent für systemweite Tastatureingabe auf einem ANDEREN PC
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
